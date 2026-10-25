require('dotenv').config();

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : defaultValue;
}

function toJson(value, defaultValue = {}) {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

const port = toInt(process.env.PORT, 3000);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');

const config = {
  app: {
    port,
    url: appUrl
  },

  bot: {
    token: process.env.BOT_TOKEN
  },

  admin: {
    id: (process.env.ADMIN_ID || '').split(',')[0]?.trim() || '',
    ids: (process.env.ADMIN_ID || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
  },

  support: {
    username: process.env.SUPPORT_USERNAME || ''
  },

  payments: {
    currency: process.env.PAYSTACK_CURRENCY || 'NGN',
    minAmountKobo: toInt(process.env.MIN_FUND_AMOUNT_NGN, 100) * 100,
    maxAmountKobo: toInt(process.env.MAX_FUND_AMOUNT_NGN, 1000000) * 100
  },

  pricing: {
    markupPercent: Number.isFinite(Number(process.env.PRICE_MARKUP_PERCENT))
      ? Number(process.env.PRICE_MARKUP_PERCENT)
      : 20,
    flatFeeKobo: Math.round(
      (Number.isFinite(Number(process.env.PRICE_FLAT_FEE_NGN))
        ? Number(process.env.PRICE_FLAT_FEE_NGN)
        : 50) * 100
    )
  },

  paystack: {
    mode: process.env.PAYSTACK_MODE || 'test',
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
    baseUrl: (process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co').replace(/\/$/, ''),
    currency: process.env.PAYSTACK_CURRENCY || 'NGN',
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || `${appUrl}/webhooks/paystack`,
    verifyWebhookSignature: toBool(process.env.PAYSTACK_VERIFY_WEBHOOK_SIGNATURE, true),
    verifyWithApi: toBool(process.env.PAYSTACK_VERIFY_WITH_API, false),
    pollIntervalMs: toInt(process.env.PAYSTACK_POLL_INTERVAL_MS, 20000)
  },

  dssmshub: {
    baseUrl: (process.env.DSSMSHUB_BASE_URL || 'https://dssmshub.com/api/v1').replace(/\/$/, ''),
    apiKey: process.env.DSSMSHUB_API_KEY || '',
    webhookSecret: process.env.DSSMSHUB_WEBHOOK_SECRET || '',
    verifyWebhookSignature: toBool(process.env.DSSMSHUB_VERIFY_WEBHOOK_SIGNATURE, true),
    defaultCurrency: process.env.DSSMSHUB_DEFAULT_CURRENCY || process.env.PAYSTACK_CURRENCY || 'NGN',
    defaultServer: process.env.DSSMSHUB_DEFAULT_SERVER
      ? toInt(process.env.DSSMSHUB_DEFAULT_SERVER, 0)
      : null,
    pollIntervalMs: toInt(process.env.DSSMSHUB_POLL_INTERVAL_MS, 15000),
    cacheTtlMs: toInt(process.env.DSSMSHUB_CACHE_TTL_MS, 300000),
    priceUnit: process.env.DSSMSHUB_PRICE_UNIT || 'major'
  },

  fx: {
    rates: toJson(process.env.FX_RATES_JSON, {})
  }
};

if (!config.bot.token) {
  throw new Error('BOT_TOKEN is required in environment variables.');
}

module.exports = config;