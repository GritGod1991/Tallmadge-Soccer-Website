CREATE TABLE news_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('result', 'standings', 'field')),
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_label TEXT NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  UNIQUE (kind, source_id, source_version)
);
