-- Shared D1 schema for studio product traffic (database: studio-metrics).
-- No raw IP addresses or other personal data. Visitor uniqueness uses
-- sha256(daily_salt || IP || user-agent); only the hash is stored.

CREATE TABLE IF NOT EXISTS daily_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests_daily (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worker, day, route)
);

CREATE TABLE IF NOT EXISTS uniques_daily (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worker, day)
);

CREATE TABLE IF NOT EXISTS visitor_hashes (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (worker, day, hash)
);

CREATE TABLE IF NOT EXISTS scans_daily (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  fail INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worker, day)
);

CREATE TABLE IF NOT EXISTS badges_daily (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worker, day)
);

CREATE TABLE IF NOT EXISTS referrers_daily (
  worker TEXT NOT NULL,
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (worker, day, host)
);
