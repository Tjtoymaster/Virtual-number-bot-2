const { Markup } = require('telegraf');
const config = require('../config');
const database = require('../database/database');
const orderService = require('../services/orderService');
const { clearState } = require('../utils/state');
const { editOrReply } = require('../utils/helpers');
const { mainMenuMarkup, backMenuMarkup } = require('../utils/keyboards');
const {
  escapeHtml,
  formatMoney,
  shortId,
  formatOrderStatus,
  formatDate
} = require('../utils/format');

function renderOrderText(order) {
  const lines = [
    `<b>Order:</b> <code>${shortId(order.id)}</code>`,
    `<b>Type:</b> ${order.type === 'balance_topup' ? 'Balance Top-up' : 'Virtual Number'}`,
    `<b>Status:</b> ${formatOrderStatus(order.status)}`,
    `<b>Amount:</b> ${formatMoney(order.amountKobo, order.currency)}`
  ];

  if (order.paymentMethod) {
    lines.push(`<b>Payment Method:</b> ${escapeHtml(order.paymentMethod)}`);
  }

  if (order.country?.name) {
    lines.push(`<b>Country:</b> ${escapeHtml(order.country.name)}`);
  }

  if (order.service?.name) {
    lines.push(`<b>Service:</b> ${escapeHtml(order.service.name)}`);
  }

  if (order.phoneNumber) {
    lines.push(`<b>Number:</b> <code>${escapeHtml(order.phoneNumber)}</code>`);
  }

  if (order.otp) {
    lines.push(`<b>OTP:</b> <code>${escapeHtml(order.otp)}</code>`);
  }

  if (order.smsText) {
    lines.push(`<b>SMS:</b>\n<pre>${escapeHtml(String(order.smsText).slice(0, 3000))}</pre>`);
  }

  if (order.error) {
    lines.push(`<b>Error:</b> ${escapeHtml(order.error)}`);
  }

  lines.push(`<b>Created:</b> ${formatDate(order.createdAt)}`);

  return lines.join('\n');
}

async function sendMainMenu(ctx, text = 'Choose an option:') {
  await editOrReply(ctx, text, mainMenuMarkup());
}

async function showBalance(ctx) {
  const user = database.getUser(ctx.from.id);

  const text = [
    '💰 <b>My Balance</b>',
    '',
    `<b>Current Balance:</b> ${formatMoney(user.balance, config.payments.currency)}`,
    '',
    'Use Fund Balance to top up via Paystack.'
  ].join('\n');

  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Fund Balance', 'fund_balance')],
    [Markup.button.callback('🔙 Back to Menu', 'menu')]
  ]);

  await editOrReply(ctx, text, markup);
}

async function showAccount(ctx) {
  const user = database.getUser(ctx.from.id);

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'N/A';
  const username = user.username ? `@${user.username}` : 'N/A';

  const text = [
    '👤 <b>My Account</b>',
    '',
    `<b>Name:</b> ${escapeHtml(name)}`,
    `<b>Username:</b> ${escapeHtml(username)}`,
    `<b>Telegram ID:</b> <code>${escapeHtml(user.id)}</code>`,
    `<b>Balance:</b> ${formatMoney(user.balance, config.payments.currency)}`,
    `<b>Joined:</b> ${formatDate(user.createdAt)}`
  ].join('\n');

  await editOrReply(ctx, text, backMenuMarkup());
}

async function showSupport(ctx) {
  const support = config.support.username
    ? `Contact support: ${escapeHtml(config.support.username)}`
    : `Contact support via admin ID: <code>${escapeHtml(config.admin.id || 'not set')}</code>`;

  const text = [
    '🆘 <b>Support</b>',
    '',
    'If you have issues with payments, orders, or OTP delivery, contact support.',
    '',
    support
  ].join('\n');

  await editOrReply(ctx, text, backMenuMarkup());
}

async function showOrders(ctx) {
  const orders = database.getUserOrders(ctx.from.id).slice(0, 10);

  if (!orders.length) {
    await editOrReply(
      ctx,
      '📦 You have no orders yet.\n\nUse Buy Number to create your first order.',
      backMenuMarkup()
    );
    return;
  }

  const buttons = orders.map(order => {
    const typeLabel = order.type === 'balance_topup'
      ? 'Top-up'
      : (order.service?.name || 'Number');

    const label = `#${shortId(order.id)} · ${typeLabel} · ${formatOrderStatus(order.status)}`;

    return [
      Markup.button.callback(label.slice(0, 60), `view_order:${order.id}`)
    ];
  });

  buttons.push([Markup.button.callback(' Back to Menu', 'menu')]);

  await editOrReply(
    ctx,
    '📦 <b>My Orders</b>\n\nSelect an order to view details.',
    Markup.inlineKeyboard(buttons)
  );
}

async function viewOrder(ctx, orderId) {
  const order = database.getOrder(orderId);

  if (!order || (order.userId !== String(ctx.from.id) && String(ctx.from.id) !== config.admin.id)) {
    await editOrReply(ctx, 'Order not found.', backMenuMarkup());
    return;
  }

  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', `refresh_order:${order.id}`)],
    [Markup.button.callback('📦 My Orders', 'my_orders')]
  ]);

  await editOrReply(ctx, renderOrderText(order), markup);
}

async function refreshOrder(ctx, orderId) {
  const order = database.getOrder(orderId);

  if (!order || (order.userId !== String(ctx.from.id) && String(ctx.from.id) !== config.admin.id)) {
    await editOrReply(ctx, 'Order not found.', backMenuMarkup());
    return;
  }

  await orderService.processActiveOrder(order.id);

  const updated = database.getOrder(order.id);

  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', `refresh_order:${updated.id}`)],
    [Markup.button.callback('📦 My Orders', 'my_orders')]
  ]);

  await editOrReply(ctx, renderOrderText(updated), markup);
}

function registerUserHandlers(bot) {
  bot.start(async ctx => {
    const name = escapeHtml(ctx.from.first_name || 'there');

    await ctx.reply(
      `Hello ${name} 👋\n\nWelcome to the Virtual Number bot.\nUse the menu below to buy numbers, check orders, or fund your balance.`,
      mainMenuMarkup()
    );
  });

  bot.command('menu', async ctx => {
    await ctx.reply('Main menu:', mainMenuMarkup());
  });

  bot.action('noop', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
  });

  bot.action('menu', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    clearState(ctx.from.id);
    await sendMainMenu(ctx);
  });

  bot.action('my_balance', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await showBalance(ctx);
  });

  bot.action('my_account', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await showAccount(ctx);
  });

  bot.action('support', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await showSupport(ctx);
  });

  bot.action('my_orders', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await showOrders(ctx);
  });

  bot.action(/^view_order:(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    await viewOrder(ctx, ctx.match[1]);
  });

  bot.action(/^refresh_order:(.+)$/, async ctx => {
    await ctx.answerCbQuery('Refreshing...').catch(() => {});
    await refreshOrder(ctx, ctx.match[1]);
  });

  bot.action('cancel_action', async ctx => {
    await ctx.answerCbQuery().catch(() => {});
    clearState(ctx.from.id);
    await sendMainMenu(ctx, 'Operation cancelled.');
  });
}

module.exports = {
  registerUserHandlers,
  renderOrderText
};