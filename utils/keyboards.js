const { Markup } = require('telegraf');

function mainMenuMarkup() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🛒 Buy Number', 'buy_number'),
      Markup.button.callback('🌍 Countries', 'countries')
    ],
    [
      Markup.button.callback('📦 My Orders', 'my_orders'),
      Markup.button.callback('💰 My Balance', 'my_balance')
    ],
    [
      Markup.button.callback('👤 My Account', 'my_account'),
      Markup.button.callback('🆘 Support', 'support')
    ]
  ]);
}

function backMenuMarkup(label = '🔙 Back to Menu') {
  return Markup.inlineKeyboard([
    [Markup.button.callback(label, 'menu')]
  ]);
}

module.exports = {
  mainMenuMarkup,
  backMenuMarkup
};