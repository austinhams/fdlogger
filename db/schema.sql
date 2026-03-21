-- Run this manually if you prefer not to use auto-initialization:
--   createdb fdlogger
--   psql -d fdlogger -f db/schema.sql

CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  band VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  power VARCHAR(20) NOT NULL,
  current_operator VARCHAR(50) DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  callsign VARCHAR(20) NOT NULL,
  class VARCHAR(10) NOT NULL,
  section VARCHAR(10) NOT NULL,
  band VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  power VARCHAR(20) NOT NULL,
  operator VARCHAR(50) NOT NULL,
  frequency INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_station ON contacts(station_id);
CREATE INDEX IF NOT EXISTS idx_contacts_section ON contacts(section);
CREATE INDEX IF NOT EXISTS idx_contacts_callsign ON contacts(callsign);
