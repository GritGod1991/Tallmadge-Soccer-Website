CREATE TABLE club_divisions (
  name TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  league TEXT NOT NULL CHECK (league IN ('travel', 'rec'))
);
