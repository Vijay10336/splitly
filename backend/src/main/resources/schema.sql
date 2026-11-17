CREATE TABLE IF NOT EXISTS app_users (
 id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE,
 name VARCHAR(80) NOT NULL, password_hash VARCHAR(100), verified BOOLEAN NOT NULL DEFAULT FALSE,
 google_sub VARCHAR(255) UNIQUE
);
CREATE TABLE IF NOT EXISTS auth_tokens (
 token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) REFERENCES app_users(id),
 kind VARCHAR(20) NOT NULL, expires_at BIGINT NOT NULL, extra VARCHAR(500)
);
CREATE TABLE IF NOT EXISTS expense_groups (
 id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL REFERENCES app_users(id),
 name VARCHAR(80) NOT NULL, currency VARCHAR(3) NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 id VARCHAR(36) PRIMARY KEY, group_id VARCHAR(36) NOT NULL REFERENCES expense_groups(id),
 name VARCHAR(80) NOT NULL, email VARCHAR(254), position INTEGER NOT NULL,
 UNIQUE(group_id, email)
);
CREATE TABLE IF NOT EXISTS expenses (
 id VARCHAR(36) PRIMARY KEY, group_id VARCHAR(36) NOT NULL REFERENCES expense_groups(id),
 title VARCHAR(120) NOT NULL, amount BIGINT NOT NULL CHECK(amount > 0),
 payer_id VARCHAR(36) NOT NULL REFERENCES members(id), created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
 expense_id VARCHAR(36) NOT NULL REFERENCES expenses(id), member_id VARCHAR(36) NOT NULL REFERENCES members(id),
 amount BIGINT NOT NULL CHECK(amount >= 0), PRIMARY KEY(expense_id, member_id)
);
CREATE TABLE IF NOT EXISTS settlements (
 id VARCHAR(36) PRIMARY KEY, group_id VARCHAR(36) NOT NULL REFERENCES expense_groups(id),
 from_id VARCHAR(36) NOT NULL REFERENCES members(id), to_id VARCHAR(36) NOT NULL REFERENCES members(id),
 amount BIGINT NOT NULL CHECK(amount > 0), created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS commands (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES app_users(id),
 fingerprint VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS members_email_idx ON members(email);
CREATE INDEX IF NOT EXISTS tokens_expiry_idx ON auth_tokens(expires_at);
