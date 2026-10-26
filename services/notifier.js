const logger = require('../utils/logger');

let bot = null;

function setBot(botInstance) {
  bot = botInstance;
}

async function notifyUser(userId, text, options = {}) {
  if (!bot) return false;

  try {
    await bot.telegram.sendMessage(userId, text, {
      parse_mode: 'HTML',
      ...options
    });
    return true;
  } catch (err) {
    logger.warn(`Failed to notify user ${userId}:`, err.message);
    return false;
  }
}

module.exports = {
  setBot,
  notifyUser
};