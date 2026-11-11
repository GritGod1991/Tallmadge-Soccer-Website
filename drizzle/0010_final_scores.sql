ALTER TABLE scheduled_games ADD COLUMN final_score_json TEXT
  CHECK (final_score_json IS NULL OR (
    json_valid(final_score_json) AND json_type(final_score_json) = 'array'
    AND json_array_length(final_score_json) = 2
  ));
