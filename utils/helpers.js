function chunk(array, size) {
  if (!Array.isArray(array)) return [];
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function editOrReply(ctx, text, markup) {
  const extra = {
    parse_mode: 'HTML',
    ...(markup || {})
  };

  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(text, extra);
    } else {
      await ctx.reply(text, extra);
    }
  } catch (err) {
    const message = String(err?.message || '');

    if (message.includes('message is not modified')) return;

    if (message.includes('message to edit not found') || message.includes('MESSAGE_ID_INVALID')) {
      await ctx.reply(text, extra).catch(() => {});
      return;
    }

    throw err;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { chunk, editOrReply, sleep };