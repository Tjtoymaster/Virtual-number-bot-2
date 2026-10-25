require('dotenv').config();

const express = require('express');
const { Telegraf } = require('telegraf');

const config = require('./config');
const logger = require('./utils/logger');
const database = require('./database/database');
const notifier = require('./services/notifier');
const smsPoller = require('./jobs/smsPoller');
const paymentPoller = require('./jobs/paymentPoller');
const paystackWebhookRouter = require('./routes/paystackWebhook');
const dssWebhookRouter = require('./routes/dssWebhook');

const userHandler = require('./handlers/user');
const paymentHandler = require('./handlers/payments');
const purchaseHandler = require('./handlers/purchase');

const { clearState } = require('./utils/state');
const { mainMenuMarkup } = require('./utils/keyboards');

const bot = new Telegraf(config.bot.token);
notifier.setBot(bot);

process.on('unhandledRejection', err => {
  logger.error('Unhandled rejection:', err);
});

process.on('uncaughtException', err => {
  logger.error('Uncaught exception:', err);
});

bot.use(async (ctx, next) => {
  try {
    if (ctx.from && !ctx.from.is_bot) {
      database.registerUser(ctx.from);
      ctx.state.user = database.getUser(ctx.from.id);
    }
  } catch (err) {
    logger.error('User registration middleware error:', err);
  }

  await next();
});

try {
  let adminModule = require('./handlers/admin');

  if (adminModule && typeof adminModule.default === 'function') {
    adminModule = adminModule.default;
  }

  if (typeof adminModule === 'function') {
    adminModule(bot, database, { adminId: config.admin.id, adminIds: config.admin.ids });
    logger.info('Admin handler loaded successfully.');
  } else if (adminModule && typeof adminModule.registerAdmin === 'function') {
    adminModule.registerAdmin(bot, database, { adminId: config.admin.id, adminIds: config.admin.ids });
    logger.info('Admin handler loaded successfully.');
  } else {
    logger.warn('handlers/admin.js found but did not export a valid register function.');
  }
} catch (err) {
  logger.error('Failed to load handlers/admin.js:', err.message);
}

userHandler.registerUserHandlers(bot);
paymentHandler.registerPaymentHandlers(bot);
purchaseHandler.registerPurchaseHandlers(bot);

bot.command('cancel', async ctx => {
  if (!ctx.from || ctx.from.is_bot) return;

  clearState(ctx.from.id);
  await ctx.reply('Operation cancelled.', mainMenuMarkup());
});

bot.on('text', async (ctx, next) => {
  try {
    if (!ctx.from || ctx.from.is_bot) return next();
    if (!ctx.message?.text) return next();

    const text = ctx.message.text.trim();

    if (text === '/cancel') {
      clearState(ctx.from.id);
      await ctx.reply('Operation cancelled.', mainMenuMarkup());
      return;
    }

    if (text.startsWith('/')) {
      clearState(ctx.from.id);
      return next();
    }

    if (await paymentHandler.handlePaymentMessage(ctx)) return;
    if (await purchaseHandler.handlePurchaseMessage?.(ctx)) return;

    await next();
  } catch (err) {
    logger.error('Text handler error:', err);
    await next();
  }
});

bot.on('message', async ctx => {
  try {
    if (!ctx.message?.text) return;
    if (ctx.message.text.startsWith('/')) return;

    await ctx.reply('Please use the menu below.', mainMenuMarkup());
  } catch (err) {
    logger.error('Fallback message handler error:', err);
  }
});

bot.catch(err => {
  logger.error('Telegraf error:', err);
});

const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => {
  res.json({
    status: true,
    service: 'telegram-virtual-number-bot',
    mode: 'webhook-less friendly (polling primary, webhooks bonus)',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use('/webhooks', paystackWebhookRouter);
app.use('/webhooks', dssWebhookRouter);

app.use((err, req, res, next) => {
  logger.error('Express error:', err);
  res.status(200).json({ status: false, message: 'Server error' });
});

async function start() {
  try {
    if (/localhost|127\.0\.0\.1/.test(config.paystack.callbackUrl)) {
      logger.warn(
        'PAYSTACK_CALLBACK_URL points to localhost. Webhooks cannot reach it - this is fine in webhook-less mode, payments will be confirmed by the payment poller.'
      );
    }

    await bot.telegram
      .setMyCommands([
        { command: 'start', description: 'Start the bot' },
        { command: 'menu', description: 'Open main menu' },
        { command: 'admin', description: 'Admin panel' },
        { command: 'cancel', description: 'Cancel current action' }
      ])
      .catch(() => {});

    const server = app.listen(config.app.port, () => {
      logger.info(`Express server listening on port ${config.app.port}`);
      logger.info(`Health check: ${config.app.url}/health`);
      logger.info(`Paystack webhook (bonus): ${config.paystack.callbackUrl}`);
      logger.info(`DSSMSHub webhook (bonus): ${config.app.url}/webhooks/dssmshub`);
    });

    await bot.launch({ dropPendingUpdates: true });
    logger.info('Telegram bot launched.');

    smsPoller.start();
    paymentPoller.start();

    logger.info(
      'Webhook-less mode active: payments confirmed via Paystack verify polling, OTPs via DSSMSHub polling. Webhooks remain enabled as a bonus if reachable.'
    );

    const shutdown = async signal => {
      logger.info(`Received ${signal}. Shutting down...`);

      smsPoller.stop();
      paymentPoller.stop();

      server.close(() => logger.info('Express server closed.'));

      try {
        await bot.stop();
      } catch (err) {
        logger.warn('Error stopping bot:', err.message);
      }

      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to start application:', err);
    process.exit(1);
  }
}

start();