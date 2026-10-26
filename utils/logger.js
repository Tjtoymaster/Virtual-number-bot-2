function log(level, ...args) {
  const time = new Date().toISOString();
  console[level](`[${time}]`, ...args);
}

module.exports = {
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  debug: (...args) => log('debug', ...args)
};