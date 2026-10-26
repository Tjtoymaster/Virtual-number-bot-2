const express = require('express');
const crypto = require('crypto');
const config = require('../config');
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

function verifySignature(req) {
  const secret = config.dssmshub.webhookSecret;
  const signature = req.headers['x-dss-signature'];

  if (!secret) {
    return !config.dssmshub.verifyWebhookSignature;
  }

  if (!signature) return false;

  const raw = req.rawBody || JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const provided = String(signature).replace(/^sha256=/i, '');

  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

router.post('/dssmshub', async (req, res) => {
  try {
    if (!verifySignature(req)) {
      logger.warn('Invalid DSSMSHub webhook signature.');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const result = await orderService.handleProviderOtpWebhook(req.body || {});

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('DSSMSHub webhook error:', err);
    return res.status(200).json({ success: true, message: 'Acknowledged' });
  }
});

module.exports = router;
