const states = new Map();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function setState(userId, type, data = {}) {
  states.set(String(userId), {
    type,
    data,
    expiresAt: Date.now() + DEFAULT_TTL_MS
  });
}

function getState(userId) {
  const state = states.get(String(userId));
  if (!state) return null;

  if (Date.now() > state.expiresAt) {
    states.delete(String(userId));
    return null;
  }

  return state;
}

function clearState(userId) {
  states.delete(String(userId));
}

module.exports = {
  setState,
  getState,
  clearState
};