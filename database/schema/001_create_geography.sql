-- ==========================================
-- GEOGRAPHY TABLES
-- ==========================================
-- Station response areas and beats (FATOMS) for Montgomery County
-- Converted from PostgreSQL/PostGIS to SQLite/SpatiaLite

-- ===========================================
-- STATION RESPONSE AREAS
-- ===========================================

CREATE TABLE station_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_number TEXT NOT NULL UNIQUE,
    station_name TEXT,
    source TEXT DEFAULT 'moco_gis',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Add geometry column for station boundaries (POLYGON)
SELECT AddGeometryColumn('station_areas', 'geom', 4326, 'POLYGON', 'XY');

-- Create spatial index for efficient spatial queries
SELECT CreateSpatialIndex('station_areas', 'geom');

-- Create regular index on station_number for fast lookups
CREATE INDEX idx_station_areas_number ON station_areas(station_number);

-- ===========================================
-- BEATS (FATOMS Sub-areas)
-- ===========================================

CREATE TABLE beats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector TEXT,
    beat TEXT,
    box_id TEXT,
    -- SQLite doesn't support GENERATED ALWAYS, so we'll use a trigger
    display_name TEXT,
    station_id INTEGER REFERENCES station_areas(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(sector, beat)
);

-- Add geometry column for beat boundaries (POLYGON)
SELECT AddGeometryColumn('beats', 'geom', 4326, 'POLYGON', 'XY');

-- Create spatial index
SELECT CreateSpatialIndex('beats', 'geom');

-- Create index on station_id for joins
CREATE INDEX idx_beats_station ON beats(station_id);

-- Trigger to automatically generate display_name
CREATE TRIGGER beats_display_name_insert
AFTER INSERT ON beats
FOR EACH ROW
WHEN NEW.display_name IS NULL
BEGIN
    UPDATE beats
    SET display_name = COALESCE(NEW.sector, '') || '-' || COALESCE(NEW.beat, '')
    WHERE id = NEW.id;
END;

CREATE TRIGGER beats_display_name_update
AFTER UPDATE OF sector, beat ON beats
FOR EACH ROW
BEGIN
    UPDATE beats
    SET display_name = COALESCE(NEW.sector, '') || '-' || COALESCE(NEW.beat, '')
    WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp for station_areas
CREATE TRIGGER station_areas_update_timestamp
AFTER UPDATE ON station_areas
FOR EACH ROW
BEGIN
    UPDATE station_areas
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;
