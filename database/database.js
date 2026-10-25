const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, 'users.json');

function defaultDb() {
  return {
    users: {},
    orders: {},
    indexes: {
      paymentsByReference: {}
    },
    meta: {
      createdAt: new Date().toISOString()
    }
  };
}

function normalizeDb(db) {
  const base = defaultDb();
  return {
    ...base,
    ...db,
    users: db?.users || {},
    orders: db?.orders || {},
    indexes: {
      ...base.indexes,
      ...(db?.indexes || {})
    },
    meta: {
      ...base.meta,
      ...(db?.meta || {})
    }
  };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    if (!raw.trim()) return defaultDb();
    return normalizeDb(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return defaultDb();
    }

    if (err instanceof SyntaxError) {
      const backupPath = `${DB_PATH}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(DB_PATH, backupPath);
        console.error(`[database] users.json was corrupt. Backup saved to ${backupPath}`);
      } catch {}
      return defaultDb();
    }

    throw err;
  }
}

let db = loadDb();

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_PATH);
}

function pushTransaction(user, amountKobo, reason) {
  if (!Array.isArray(user.transactions)) user.transactions = [];

  user.transactions.unshift({
    id: crypto.randomUUID(),
    amountKobo,
    balanceAfter: user.balance,
    reason: reason || 'Adjustment',
    createdAt: new Date().toISOString()
  });

  if (user.transactions.length > 100) {
    user.transactions = user.transactions.slice(0, 100);
  }
}

function getDatabase() {
  return db;
}

function writeDatabase(nextDb) {
  db = normalizeDb(nextDb);
  persist();
  return db;
}

function registerUser(user) {
  if (!user || user.id === undefined || user.id === null) return null;

  const id = String(user.id);
  const now = new Date().toISOString();
  const existing = db.users[id];

  if (
    existing &&
    existing.username === user.username &&
    existing.firstName === user.first_name &&
    existing.lastName === user.last_name
  ) {
    return existing;
  }

  db.users[id] = {
    id,
    balance: Number(existing?.balance || 0),
    orders: existing?.orders || [],
    transactions: existing?.transactions || [],
    username: user.username ?? existing?.username ?? null,
    firstName: user.first_name ?? existing?.firstName ?? null,
    lastName: user.last_name ?? existing?.lastName ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  persist();
  return db.users[id];
}

function getUser(userId) {
  return db.users[String(userId)] || null;
}

function getAllUsers() {
  return Object.values(db.users);
}

function updateUser(userId, updates = {}) {
  const user = db.users[String(userId)];
  if (!user) return null;

  Object.assign(user, updates, {
    updatedAt: new Date().toISOString()
  });

  persist();
  return user;
}

function addBalance(userId, amountKobo, reason = 'Balance credit') {
  const user = db.users[String(userId)];
  if (!user) throw new Error('User not found');

  const amount = Math.trunc(Number(amountKobo));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Credit amount must be positive');
  }

  user.balance = Math.trunc(Number(user.balance || 0)) + amount;
  user.updatedAt = new Date().toISOString();
  pushTransaction(user, amount, reason);

  persist();
  return user;
}

function deductBalance(userId, amountKobo, reason = 'Balance debit') {
  const user = db.users[String(userId)];
  if (!user) throw new Error('User not found');

  const amount = Math.trunc(Number(amountKobo));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invalid debit amount');
  }

  user.balance = Math.trunc(Number(user.balance || 0));

  if (amount > user.balance) {
    throw new Error('Insufficient balance');
  }

  user.balance -= amount;
  user.updatedAt = new Date().toISOString();
  pushTransaction(user, -amount, reason);

  persist();
  return user;
}

function createOrder(input = {}) {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();

  if (db.orders[id]) {
    throw new Error('Order already exists');
  }

  const order = {
    id,
    userId: String(input.userId),
    type: input.type || 'number_purchase',
    status: input.status || 'pending_payment',
    amountKobo: Math.trunc(Number(input.amountKobo || 0)),
    currency: input.currency || 'NGN',
    server: input.server || null,
    paymentMethod: input.paymentMethod || null,
    paymentReference: input.paymentReference || null,
    country: input.country || null,
    service: input.service || null,
    providerOrderId: input.providerOrderId || null,
    phoneNumber: input.phoneNumber || null,
    otp: input.otp || null,
    smsText: input.smsText || null,
    error: input.error || null,
    refunded: Boolean(input.refunded),
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
    paidAt: input.paidAt || null,
    completedAt: input.completedAt || null,
    failedAt: input.failedAt || null
  };

  db.orders[id] = order;

  if (!db.users[order.userId]) {
    db.users[order.userId] = {
      id: order.userId,
      balance: 0,
      orders: [],
      transactions: [],
      createdAt: now,
      updatedAt: now
    };
  }

  const user = db.users[order.userId];
  if (!Array.isArray(user.orders)) user.orders = [];

  if (!user.orders.includes(id)) {
    user.orders.unshift(id);
    user.orders = user.orders.slice(0, 100);
  }

  if (order.paymentReference) {
    db.indexes.paymentsByReference[order.paymentReference] = id;
  }

  persist();
  return order;
}

function getOrder(orderId) {
  return db.orders[String(orderId)] || null;
}

function updateOrder(orderId, updates = {}) {
  const order = db.orders[String(orderId)];
  if (!order) return null;

  const oldReference = order.paymentReference;
  const { metadata, ...rest } = updates;

  if (metadata && typeof metadata === 'object') {
    order.metadata = {
      ...(order.metadata || {}),
      ...metadata
    };
  }

  Object.assign(order, rest, {
    updatedAt: new Date().toISOString()
  });

  if (order.status === 'paid' && !order.paidAt) {
    order.paidAt = new Date().toISOString();
  }

  if (order.status === 'completed' && !order.completedAt) {
    order.completedAt = new Date().toISOString();
  }

  if (order.status === 'failed' && !order.failedAt) {
    order.failedAt = new Date().toISOString();
  }

  if (oldReference !== order.paymentReference) {
    if (oldReference && db.indexes.paymentsByReference[oldReference] === order.id) {
      delete db.indexes.paymentsByReference[oldReference];
    }

    if (order.paymentReference) {
      db.indexes.paymentsByReference[order.paymentReference] = order.id;
    }
  }

  persist();
  return order;
}

function getOrderByPaymentReference(reference) {
  if (!reference) return null;

  const indexedId = db.indexes.paymentsByReference[reference];
  if (indexedId && db.orders[indexedId]) {
    return db.orders[indexedId];
  }

  return Object.values(db.orders).find(order => order.paymentReference === reference) || null;
}

function getUserOrders(userId) {
  const id = String(userId);
  const user = db.users[id];

  let orders = [];

  if (user && Array.isArray(user.orders)) {
    orders = user.orders
      .map(orderId => db.orders[orderId])
      .filter(Boolean);
  } else {
    orders = Object.values(db.orders).filter(order => order.userId === id);
  }

  return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getActiveOrders() {
  return Object.values(db.orders).filter(order => {
    return (
      order.type === 'number_purchase' &&
      ['paid', 'waiting_sms', 'provisioning'].includes(order.status)
    );
  });
}

module.exports = {
  getDatabase,
  writeDatabase,
  registerUser,
  getUser,
  getAllUsers,
  updateUser,
  addBalance,
  deductBalance,
  createOrder,
  getOrder,
  updateOrder,
  getOrderByPaymentReference,
  getUserOrders,
  getActiveOrders
};
