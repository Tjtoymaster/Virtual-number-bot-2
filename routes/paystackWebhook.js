const express = require('express');
const paystack = require('../services/paystack');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

const router = express.Router();

router.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

router.post('/paystack', async (req, res) => {
  try {
    if (!paystack.verifyWebhookSignature(req)) {
      logger.warn('Paystack webhook REJECTED: invalid signature. Check PAYSTACK_WEBHOOK_SECRET.');
      return res.status(400).json({
        status: false,
        message: 'Invalid signature'
      });
    }

    const payload = paystack.extractWebhookPayload(req.body || {});

    logger.info(
      `Paystack webhook received: event=${payload.event} reference=${payload.reference || 'none'} status=${payload.status} amount=${payload.amount} currency=${payload.currency || 'n/a'}`
    );

    if (!payload.reference) {
      return res.status(200).json({
        status: true,
        message: 'No payment reference found'
      });
    }

    const result = await orderService.completePaymentByReference(payload.reference, payload);

    logger.info(
      `Paystack webhook processed: reference=${payload.reference} result=${JSON.stringify({
        success: result.success ?? null,
        ignored: result.ignored ?? null,
        reason: result.reason ?? null
      })}`
    );

    return res.status(200).json({
      status: true,
      message: 'Webhook processed'
    });
  } catch (err) {
    logger.error('Paystack webhook error:', err);

    return res.status(200).json({
      status: true,
      message: 'Acknowledged'
    });
  }
});

module.exports = router;