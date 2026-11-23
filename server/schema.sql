CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'faculty')),
  department TEXT NOT NULL CHECK (department IN ('ECE', 'CSE', 'Mechanical'))
) STRICT;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  deadline_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('ECE', 'CSE', 'Mechanical')),
  lab TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  specifications TEXT NOT NULL CHECK (json_valid(specifications)),
  location TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'maintenance')),
  requires_approval INTEGER NOT NULL CHECK (requires_approval IN (0, 1)),
  image TEXT,
  sort_order INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  kind TEXT NOT NULL CHECK (kind IN ('open', 'maintenance')),
  UNIQUE (resource_id, starts_at, ends_at, kind)
) STRICT;

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  purpose TEXT NOT NULL,
  created_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS faculty_approvals (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  faculty_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'declined')),
  decided_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS project_equipment_requirements (
  project_id TEXT NOT NULL REFERENCES projects(id),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  PRIMARY KEY (project_id, resource_id)
) STRICT;

CREATE INDEX IF NOT EXISTS availability_resource_time ON availability (resource_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS bookings_resource_time ON bookings (resource_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id);
