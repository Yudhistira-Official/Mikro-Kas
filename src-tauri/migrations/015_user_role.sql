-- Migration 015: Multi user & role system
-- Replaces simple PIN kasir with full user management (username, password hash, role)
-- Roles: admin (full access), supervisor (all except user mgmt), kasir (POS only)
-- Password: bcrypt hash for security
-- Session: managed in process memory by the Rust application; restart requires login

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nama_lengkap TEXT,
  role TEXT NOT NULL DEFAULT 'kasir',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  aksi TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_logs_user ON user_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logs_timestamp ON user_logs(timestamp);
