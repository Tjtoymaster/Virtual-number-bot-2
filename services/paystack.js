const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const { fetchJson } = require('../utils/http');

function headers() {
  return {
    Authorization: `Bearer ${config.paystack.secretKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();

  if (['success', 'successful', 'paid', 'approved', 'completed'].includes(value)) {
    return 'success';
  }

  if (['failed', 'declined', 'error', 'cancelled', 'canceled', 'abandoned', 'reversed'].includes(value)) {
    return 'failed';
  }

  return 'pending';
}

async function initializePayment({
  amountKobo,
  currency,
  reference,
  email,
  customerName,
  description
}) {
  if (!config.paystack.secretKey) {
    throw new Error('Paystack secret key is not configured');
  }

  const finalEmail = email || `user${order?.userId || 'bot'}@paystack-test.com`;

  const payload = {
    email: finalEmail,
    amount: amountKobo,
    currency,
    reference,
    callback_url: config.paystack.callbackUrl,
    metadata: {
      customer_name: customerName,
      description: description || 'Telegram virtual number purchase'
    }
  };

  logger.info(
    `Paystack initialize: reference=${reference} amount=${amountKobo} ${currency} email=${finalEmail} callback=${config.paystack.callbackUrl}`
  );

  const response = await fetchJson(
    `${config.paystack.baseUrl}/transaction/initialize`,
    {
      method: 'POST',
      headers: headers(),
      body: payload
    }
  );

  const data = response?.data || response;

  const checkoutUrl = data?.authorization_url;

  if (!checkoutUrl) {
    logger.error('Paystack initialize response missing authorization URL:', response);
    throw new Error('Payment gateway did not return a checkout URL');
  }

  logger.info(`Paystack checkout ready: reference=${reference}`);

  return {
    checkoutUrl,
    reference,
    raw: response
  };
}

async function verifyPayment(reference) {
  const response = await fetchJson(
    `${config.paystack.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: headers()
    }
  );

  const data = response?.data || response;

  return {
    status: normalizeStatus(data?.status || data?.transaction_status),
    amount: Number(data?.amount || 0),
    currency: data?.currency,
    raw: response
  };
}

function verifyWebhookSignature(req) {
  if (!config.paystack.verifyWebhookSignature) {
    return true;
  }

  const raw = req.rawBody || JSON.stringify(req.body || {});
  const secret = config.paystack.webhookSecret || config.paystack.secretKey;

  if (!secret) {
    return false;
  }

  const signature = req.headers['x-paystack-signature'];
  if (!signature) return false;

  const computed = crypto.createHmac('sha512', secret).update(raw).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

function extractWebhookPayload(body) {
  const data = body?.data || body;
  const event = body?.event || 'charge.success';

  return {
    event,
    reference: data?.reference || body?.reference,
    status: normalizeStatus(data?.status || body?.status),
    amount: Number(data?.amount || 0),
    currency: data?.currency || config.paystack.currency,
    raw: body
  };
}

module.exports = {
  initializePayment,
  verifyPayment,
  verifyWebhookSignature,
  extractWebhookPayload
};