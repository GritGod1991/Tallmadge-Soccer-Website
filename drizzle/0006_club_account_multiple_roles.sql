ALTER TABLE club_accounts ADD COLUMN club_roles_json TEXT
  CHECK (club_roles_json IS NULL OR json_type(club_roles_json) = 'array');
