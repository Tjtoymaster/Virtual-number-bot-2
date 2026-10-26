async function fetchJson(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    query,
    timeoutMs = 20000
  } = options;

  const finalUrl = new URL(url);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        finalUrl.searchParams.append(key, String(value));
      }
    }
  }

  let finalBody;
  if (body === undefined || typeof body === 'string' || body instanceof URLSearchParams) {
    finalBody = body;
  } else {
    finalBody = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(finalUrl, {
      method,
      headers,
      body: finalBody,
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        data && typeof data === 'object'
          ? data.message || data.error || data.detail || data.errors?.message || `HTTP ${response.status}`
          : `HTTP ${response.status}`;

      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  fetchJson
};