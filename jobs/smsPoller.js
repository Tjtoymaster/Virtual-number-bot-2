const config = require('../config');
const database = require('../database/database');
const orderService = require('../services/orderService');
const logger = require('../utils/logger');

let timer = null;
let running = false;

async function pollOnce() {
  if (running) return;

  running = true;

  try {
    const orders = database.getActiveOrders();

    for (const order of orders) {
      try {
        await orderService.processActiveOrder(order.id);
      } catch (err) {
        logger.error(`SMS poller failed for order ${order.id}:`, err);
      }
    }
  } finally {
    running = false;
  }
}

function start() {
  const intervalMs = config.dssmshub.pollIntervalMs;

  timer = setInterval(() => {
    pollOnce().catch(err => {
      logger.error('SMS poller error:', err);
    });
  }, intervalMs);

  logger.info(`SMS poller started. Interval: ${intervalMs}ms`);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  start,
  stop,
  pollOnce
};