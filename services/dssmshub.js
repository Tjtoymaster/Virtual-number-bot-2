const config = require('../config');
const logger = require('../utils/logger');
const { fetchJson } = require('../utils/http');

const cache = new Map();

async function cacheWrap(key, ttlMs, fetcher, force = false) {
  const existing = cache.get(key);
  const now = Date.now();

  if (!force && existing && existing.expiresAt > now) {
    return existing.value;
  }

  try {
    const value = await fetcher();
    cache.set(key, { value, expiresAt: now + ttlMs });
    return value;
  } catch (err) {
    if (existing) {
      logger.warn(`DSSMSHub fetch failed for ${key}, serving stale cache:`, err.message);
      return existing.value;
    }
    throw err;
  }
}

function headers(extra = {}) {
  if (!config.dssmshub.apiKey) {
    throw new Error('DSSMSHUB_API_KEY is not configured');
  }

  return {
    Authorization: `Bearer ${config.dssmshub.apiKey}`,
    Accept: 'application/json',
    ...extra
  };
}

// Docs envelope: { success, message, data, request_id }
function unwrap(body) {
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success === false) {
      const err = new Error(body.message || 'DSSMSHub request failed');
      err.data = body;
      throw err;
    }
    return body.data !== undefined ? body.data : body;
  }
  return body;
}

async function request(path, { method = 'GET', query, body, idempotencyKey } = {}) {
  const finalHeaders = headers(
    idempotencyKey
      ? { 'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json' }
      : {}
  );

  const response = await fetchJson(`${config.dssmshub.baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    query,
    body,
    timeoutMs: 20000
  });

  return unwrap(response);
}

// GET /balance
async function getBalance() {
  return request('/balance');
}

// GET /otp/servers
async function getServers(force = false) {
  return cacheWrap('servers', config.dssmshub.cacheTtlMs, async () => {
    const data = await request('/otp/servers');
    const rows = Array.isArray(data) ? data : (data.servers || data.items || []);

    return rows
      .map(row => ({
        id: Number(row.id ?? row.server ?? row.server_id),
        name: String(row.name ?? row.label ?? `Server ${row.id ?? row.server}`),
        description: row.description ?? null
      }))
      .filter(server => Number.isFinite(server.id));
  }, force);
}

// GET /otp/countries?server=
async function getCountries(serverId, force = false) {
  return cacheWrap(`countries:${serverId}`, config.dssmshub.cacheTtlMs, async () => {
    const data = await request('/otp/countries', { query: { server: serverId } });
    const rows = Array.isArray(data) ? data : (data.countries || data.items || []);

    return rows
      .map(row => ({
        code: String(row.code ?? row.id ?? row.country ?? ''),
        name: String(row.name ?? row.title ?? row.country_name ?? row.code ?? ''),
        raw: row
      }))
      .filter(country => country.code && country.name);
  }, force);
}

// GET /otp/services?server=&country=
async function getServices(serverId, countryCode, force = false) {
  return cacheWrap(
    `services:${serverId}:${countryCode}`,
    config.dssmshub.cacheTtlMs,
    async () => {
      const data = await request('/otp/services', {
        query: { server: serverId, country: countryCode }
      });

      const rows = Array.isArray(data) ? data : (data.services || data.items || []);

      return rows.map((row, index) => ({
        id: String(row.service ?? row.id ?? row.slug ?? index),
        name: String(row.service_name ?? row.name ?? row.title ?? row.service ?? index),
        raw: row
      }));
    },
    force
  );
}

// GET /otp/price?server=&service=&country=
async function getPrice(serverId, serviceId, countryCode) {
  const data = await request('/otp/price', {
    query: {
      server: serverId,
      service: serviceId,
      country: countryCode
    }
  });

  const price = Number(
    data?.price ?? data?.amount ?? data?.cost ?? (typeof data === 'number' ? data : NaN)
  );

  const currency = data?.currency ?? config.dssmshub.defaultCurrency;

  if (!Number.isFinite(price)) {
    throw new Error('DSSMSHub did not return a price');
  }

  return { price, currency };
}

// POST /otp/orders (requires Idempotency-Key header)
async function buyNumber({ serverId, serviceId, countryCode, serviceName, orderId }) {
  const body = {
    server: Number(serverId),
    service: serviceId
  };

  if (countryCode) body.country = String(countryCode);
  if (serviceName) body.service_name = serviceName;

  const data = await request('/otp/orders', {
    method: 'POST',
    body,
    idempotencyKey: orderId
  });

  const providerOrderId = data?.order_id ?? data?.id ?? data?.orderId;
  const phoneNumber = data?.number ?? data?.phone ?? data?.msisdn ?? null;

  if (!providerOrderId) {
    logger.error('DSSMSHub buyNumber response:', data);
    throw new Error('DSSMSHub did not return an order_id');
  }

  return {
    providerOrderId: String(providerOrderId),
    phoneNumber: phoneNumber ? String(phoneNumber) : null,
    raw: data
  };
}

// GET /otp/orders/{id}
async function getOrderStatus(providerOrderId) {
  const data = await request(`/otp/orders/${encodeURIComponent(providerOrderId)}`);

  const smsCode = data?.sms_code ?? data?.code ?? data?.otp ?? null;
  const smsText =
    data?.sms_text ?? data?.full_sms ?? data?.sms ?? (smsCode ? String(smsCode) : '');
  const rawStatus = String(data?.status ?? data?.state ?? '').toLowerCase();

  let status = 'waiting_sms';

  if (
    ['completed', 'complete', 'success', 'received', 'done', 'finished'].some(item =>
      rawStatus.includes(item)
    ) ||
    smsCode
  ) {
    status = 'completed';
  } else if (
    ['cancelled', 'canceled', 'expired', 'closed', 'failed', 'banned'].some(item =>
      rawStatus.includes(item)
    )
  ) {
    status = 'failed';
  }

  return {
    status,
    otp: smsCode ? String(smsCode) : null,
    smsText: smsText ? String(smsText) : '',
    phoneNumber: data?.number ? String(data.number) : '',
    raw: data
  };
}

// POST /otp/orders/{id}/cancel
async function cancelNumber(providerOrderId) {
  try {
    await request(`/otp/orders/${encodeURIComponent(providerOrderId)}/cancel`, {
      method: 'POST'
    });
    return true;
  } catch (err) {
    logger.warn(`DSSMSHub cancel failed for ${providerOrderId}:`, err.message);
    return false;
  }
}

module.exports = {
  getBalance,
  getServers,
  getCountries,
  getServices,
  getPrice,
  buyNumber,
  getOrderStatus,
  cancelNumber
};
