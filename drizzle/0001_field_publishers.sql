CREATE TABLE field_publishers (
  email TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Field Manager', 'Manager', 'Admin', 'Super Admin'))
);
