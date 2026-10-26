const database = require('../database/database');
const paystack = require('../services/paystack');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

const POLL_INTERVAL_MS = Number(process.env.PAYSTACK_POLL_INTERVAL_MS || 20000);
const MAX_ORDER_AGE_MS = 60 * 60 * 1000;

let timer = null;
let running = false;

async function pollOnce() {
  if (running) return;
  running = true;

  try {
    const db = database.getDatabase();
    const allOrders = Object.values(db.orders || {});
    
    // DEBUG LOG: See all orders
    logger.info(`[POLLER] Checking ${allOrders.length} total orders in database...`);

    const pending = allOrders.filter(order => {
      const isPending = order.status === 'pending_payment';
      const isPaystack = order.paymentMethod === 'paystack';
      const hasRef = !!order.paymentReference;
      const isFresh = Date.now() - new Date(order.createdAt).getTime() < MAX_ORDER_AGE_MS;
      
      // Log details for any pending order to help debug
      if (isPending) {
        logger.info(`[POLLER] Found pending order: ref=${order.paymentReference}, method=${order.paymentMethod}, fresh=${isFresh}`);
      }
      
      return isPending && isPaystack && hasRef && isFresh;
    });

    logger.info(`[POLLER] Found ${pending.length} pending Paystack orders to verify.`);

    for (const order of pending) {
      try {
        logger.info(`[POLLER] Calling Paystack API for ${order.paymentReference}...`);
        const verification = await paystack.verifyPayment(order.paymentReference);
        logger.info(`[POLLER] Paystack API returned status: ${verification.status} for ${order.paymentReference}`);

        if (verification.status === 'success') {
          logger.info(`[POLLER] ✅ Success detected for ${order.paymentReference}`);
          await orderService.completePaymentByReference(order.paymentReference, {
            event: 'payment.poll',
            reference: order.paymentReference,
            status: 'success',
            amount: Number(verification.amount) || Number(order.amountKobo),
            currency: verification.currency || order.currency,
            raw: verification.raw
          });
        } else if (verification.status === 'failed') {
          logger.info(`[POLLER]  Failure detected for ${order.paymentReference}`);
          await orderService.completePaymentByReference(order.paymentReference, {
            event: 'payment.poll',
            reference: order.paymentReference,
            status: 'failed',
            amount: 0,
            raw: verification.raw
          });
        }
      } catch (err) {
        logger.error(`[POLLER] Error verifying ${order.paymentReference}: ${err.message}`);
      }
    }
  } finally {
    running = false;
  }
}

function start() {
  logger.info(`[POLLER] Starting Paystack payment poller. Interval: ${POLL_INTERVAL_MS}ms`);
  timer = setInterval(() => {
    pollOnce().catch(err => logger.error('[POLLER] Fatal error:', err));
  }, POLL_INTERVAL_MS);
  
  // Run once immediately on start
  pollOnce().catch(err => logger.error('[POLLER] Initial run error:', err));
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, pollOnce };
