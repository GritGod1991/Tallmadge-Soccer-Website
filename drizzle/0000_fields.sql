CREATE TABLE fields (
  field_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Unknown', 'Open', 'Closed')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
