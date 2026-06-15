const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  route TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id, created_at DESC);
`);

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(plain, hash, salt) {
  try {
    const computed = crypto.scryptSync(plain, salt, 64);
    const stored = Buffer.from(hash, "hex");
    if (computed.length !== stored.length) return false;
    return crypto.timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const statements = {
  insertUser: db.prepare(
    "INSERT INTO users (username, password_hash, password_salt, balance, is_admin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  getUserByUsername: db.prepare("SELECT * FROM users WHERE username = ?"),
  getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
  updateUserBalance: db.prepare("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?"),
  countUsers: db.prepare("SELECT COUNT(*) AS n FROM users"),

  insertSession: db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ),
  getSession: db.prepare("SELECT * FROM sessions WHERE token = ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),

  insertTransaction: db.prepare(
    "INSERT INTO transactions (user_id, amount, type, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ),
  listTransactions: db.prepare(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ),

  insertApiUsage: db.prepare(
    "INSERT INTO api_usage (user_id, route, model, cost, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ),
  listApiUsage: db.prepare(
    "SELECT * FROM api_usage WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ),

  listAllUsers: db.prepare(
    "SELECT id, username, balance, is_admin, created_at, updated_at FROM users ORDER BY id ASC"
  ),
};

function createUser({ username, password, isAdmin = false, initialBalance = 0 }) {
  const cleanName = String(username || "").trim();
  if (!cleanName) throw new Error("用户名不能为空");
  if (cleanName.length > 64) throw new Error("用户名过长");
  if (typeof password !== "string" || password.length < 4) throw new Error("密码至少 4 位");
  if (statements.getUserByUsername.get(cleanName)) throw new Error("用户名已被占用");
  const { hash, salt } = hashPassword(password);
  const ts = nowIso();
  const info = statements.insertUser.run(
    cleanName,
    hash,
    salt,
    Math.max(0, Math.round(initialBalance)),
    isAdmin ? 1 : 0,
    ts,
    ts,
  );
  return statements.getUserById.get(info.lastInsertRowid);
}

function authenticate(username, password) {
  const user = statements.getUserByUsername.get(String(username || "").trim());
  if (!user) return null;
  return verifyPassword(password, user.password_hash, user.password_salt) ? user : null;
}

function createSession(userId, ttlSeconds = 60 * 60 * 24 * 30) {
  statements.deleteExpiredSessions.run(nowIso());
  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
  statements.insertSession.run(token, userId, nowIso(), expiresAt);
  return { token, expiresAt };
}

function lookupSession(token) {
  if (!token) return null;
  const row = statements.getSession.get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    statements.deleteSession.run(token);
    return null;
  }
  const user = statements.getUserById.get(row.user_id);
  return user ? { session: row, user } : null;
}

function destroySession(token) {
  if (token) statements.deleteSession.run(token);
}

function adjustBalance({ userId, delta, type, description }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const user = statements.getUserById.get(userId);
    if (!user) throw new Error("用户不存在");
    const next = user.balance + delta;
    if (next < 0) {
      const error = new Error("余额不足");
      error.statusCode = 402;
      throw error;
    }
    statements.updateUserBalance.run(next, nowIso(), userId);
    statements.insertTransaction.run(userId, delta, type, description || "", next, nowIso());
    db.exec("COMMIT");
    return next;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function recordApiUsage({ userId, route, model, cost, status }) {
  statements.insertApiUsage.run(userId, route, model || "", cost || 0, status || "", nowIso());
}

function listTransactions(userId, limit = 50) {
  return statements.listTransactions.all(userId, Math.max(1, Math.min(200, limit)));
}

function listApiUsage(userId, limit = 50) {
  return statements.listApiUsage.all(userId, Math.max(1, Math.min(200, limit)));
}

function userCount() {
  return statements.countUsers.get().n;
}

function listAllUsers() {
  return statements.listAllUsers.all().map((row) => ({
    id: row.id,
    username: row.username,
    balance: row.balance,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    balance: user.balance,
    isAdmin: !!user.is_admin,
    createdAt: user.created_at,
  };
}

module.exports = {
  createUser,
  authenticate,
  createSession,
  lookupSession,
  destroySession,
  adjustBalance,
  recordApiUsage,
  listTransactions,
  listApiUsage,
  userCount,
  listAllUsers,
  publicUser,
  getUserByUsername: (name) => statements.getUserByUsername.get(name),
  getUserById: (id) => statements.getUserById.get(id),
};
