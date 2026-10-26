const config = require('../config');

function assertAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error('Invalid amount');
  }
  return n;
}

function convertToKobo(amount, currency) {
  const targetCurrency = String(config.payments.currency).toUpperCase();
  const sourceCurrency = String(currency || targetCurrency).toUpperCase();
  const value = assertAmount(amount);

  if (value < 0) {
    throw new Error('Amount cannot be negative');
  }

  if (sourceCurrency === targetCurrency) {
    return Math.round(value * 100);
  }

  const rate = Number(config.fx?.rates?.[sourceCurrency]);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No exchange rate configured from ${sourceCurrency} to ${config.payments.currency}`);
  }

  return Math.round(value * rate * 100);
}

function providerPriceToKobo(price, currency) {
  const value = assertAmount(price);
  const sourceCurrency = String(currency || config.dssmshub.defaultCurrency).toUpperCase();

  if (config.dssmshub.priceUnit === 'minor') {
    if (sourceCurrency === String(config.payments.currency).toUpperCase()) {
      return Math.round(value);
    }
    return convertToKobo(value / 100, sourceCurrency);
  }

  return convertToKobo(value, sourceCurrency);
}

// Formula 2: sellPrice = (providerPrice * (1 + markup%)) + flatFee
// Defaults to 20% + ₦50 if config.pricing is not set.
function applyMargin(providerKobo) {
  const markupPercent = Number.isFinite(Number(config.pricing?.markupPercent))
    ? Number(config.pricing.markupPercent)
    : 20;

  const flatFeeKobo = Number.isFinite(Number(config.pricing?.flatFeeKobo))
    ? Number(config.pricing.flatFeeKobo)
    : 5000;

  const base = Math.trunc(Number(providerKobo) || 0);
  const marked = Math.round(base * (1 + markupPercent / 100));

  return marked + flatFeeKobo;
}

function parseUserAmountToKobo(text) {
  const cleaned = String(text || '').replace(/[^0-9.,]/g, '');
  if (!cleaned) {
    throw new Error('Enter a valid amount');
  }

  const normalized = cleaned.replace(/,/g, '');
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid positive amount');
  }

  const kobo = Math.round(amount * 100);

  const minMajor = (config.payments.minAmountKobo / 100).toFixed(2);
  const maxMajor = (config.payments.maxAmountKobo / 100).toFixed(2);

  if (kobo < config.payments.minAmountKobo) {
    throw new Error(`Minimum amount is ${minMajor} ${config.payments.currency}`);
  }

  if (kobo > config.payments.maxAmountKobo) {
    throw new Error(`Maximum amount is ${maxMajor} ${config.payments.currency}`);
  }

  return kobo;
}

module.exports = {
  convertToKobo,
  providerPriceToKobo,
  applyMargin,
  parseUserAmountToKobo
};