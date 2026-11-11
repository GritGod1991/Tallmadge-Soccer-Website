ALTER TABLE scheduled_games ADD COLUMN away_field_name TEXT CHECK (
  (field_id <> 'away' AND away_field_name IS NULL) OR
  (field_id = 'away' AND away_field_name IS NOT NULL AND length(trim(away_field_name)) BETWEEN 1 AND 120)
);
