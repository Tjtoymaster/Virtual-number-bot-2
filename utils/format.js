const config = require('../config');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMoney(kobo, currency = config.payments.currency) {
  const major = Number(kobo || 0) / 100;
  const formatted = major.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (currency === 'NGN') {
    return `₦${formatted}`;
  }

  return `${formatted} ${currency}`;
}

function shortId(id) {
  return String(id || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();
}

function formatOrderStatus(status) {
  const map = {
    pending_payment: '⏳ Pending Payment',
    paid: '💰 Paid',
    provisioning: '⚙️ Provisioning',
    waiting_sms: '📩 Waiting SMS',
    completed: '✅ Completed',
    failed: '❌ Failed',
    cancelled: '🚫 Cancelled'
  };

  return map[status] || status;
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString();
}

module.exports = {
  escapeHtml,
  formatMoney,
  shortId,
  formatOrderStatus,
  formatDate
};
