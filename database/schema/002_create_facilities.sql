-- ==========================================
-- FACILITIES TABLES
-- ==========================================
-- Hospitals, Nursing Homes, and Fire Stations for Montgomery County
-- Used for destination training and quiz modes

-- ===========================================
-- FIRE STATIONS
-- ===========================================

CREATE TABLE IF NOT EXISTS fire_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_number TEXT NOT NULL UNIQUE,
    station_name TEXT NOT NULL,
    address TEXT,
    city TEXT DEFAULT 'Montgomery County',
    state TEXT DEFAULT 'MD',
    zip_code TEXT,
    phone TEXT,
    station_type TEXT DEFAULT 'career',  -- career, volunteer, combination
    apparatus TEXT,  -- JSON array of apparatus types
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Add geometry column for station location (POINT)
SELECT AddGeometryColumn('fire_stations', 'geom', 4326, 'POINT', 'XY');

-- Create spatial index
SELECT CreateSpatialIndex('fire_stations', 'geom');

-- Create index on station_number
CREATE INDEX IF NOT EXISTS idx_fire_stations_number ON fire_stations(station_number);

-- ===========================================
-- HOSPITALS
-- ===========================================

CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT,  -- Abbreviated name for UI
    address TEXT,
    city TEXT,
    state TEXT DEFAULT 'MD',
    zip_code TEXT,
    phone TEXT,

    -- Capabilities (for protocol-driven destination)
    is_trauma_center BOOL DEFAULT FALSE,
    trauma_level TEXT,  -- I, II, III, or NULL
    is_stemi_center BOOL DEFAULT FALSE,
    is_stroke_center BOOL DEFAULT FALSE,
    stroke_level TEXT,  -- Primary, Comprehensive, or NULL
    is_burn_center BOOL DEFAULT FALSE,
    is_pediatric_center BOOL DEFAULT FALSE,
    has_cath_lab BOOL DEFAULT FALSE,
    has_helipad BOOL DEFAULT FALSE,

    -- Status
    is_active BOOL DEFAULT TRUE,
    notes TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Add geometry column for hospital location (POINT)
SELECT AddGeometryColumn('hospitals', 'geom', 4326, 'POINT', 'XY');

-- Create spatial index
SELECT CreateSpatialIndex('hospitals', 'geom');

-- Create indexes for capability queries
CREATE INDEX IF NOT EXISTS idx_hospitals_trauma ON hospitals(is_trauma_center);
CREATE INDEX IF NOT EXISTS idx_hospitals_stemi ON hospitals(is_stemi_center);
CREATE INDEX IF NOT EXISTS idx_hospitals_stroke ON hospitals(is_stroke_center);

-- ===========================================
-- NURSING HOMES / LONG-TERM CARE FACILITIES
-- ===========================================

CREATE TABLE IF NOT EXISTS nursing_homes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT,
    address TEXT,
    city TEXT,
    state TEXT DEFAULT 'MD',
    zip_code TEXT,
    phone TEXT,

    -- Facility details
    facility_type TEXT DEFAULT 'nursing_home',  -- nursing_home, assisted_living, rehab, memory_care
    bed_count INTEGER,
    cms_rating INTEGER,  -- 1-5 star CMS rating

    -- Status
    is_active BOOL DEFAULT TRUE,
    notes TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Add geometry column for nursing home location (POINT)
SELECT AddGeometryColumn('nursing_homes', 'geom', 4326, 'POINT', 'XY');

-- Create spatial index
SELECT CreateSpatialIndex('nursing_homes', 'geom');

-- ===========================================
-- QUIZ PROGRESS TRACKING
-- ===========================================

CREATE TABLE IF NOT EXISTS quiz_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_type TEXT NOT NULL,  -- beat_id, facility_location, protocol_destination, turn_by_turn
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    total_questions INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    score_percent REAL
);

CREATE TABLE IF NOT EXISTS quiz_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id TEXT,  -- Identifier for the specific question
    question_type TEXT,
    user_answer TEXT,
    correct_answer TEXT,
    is_correct BOOL,
    response_time_ms INTEGER,  -- Time taken to answer
    answered_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_session ON quiz_answers(session_id);

-- ===========================================
-- SPACED REPETITION DATA
-- ===========================================

CREATE TABLE IF NOT EXISTS learning_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL,  -- beat, hospital, nursing_home, station, protocol
    item_id TEXT NOT NULL,    -- Reference to the specific item

    -- SM-2 algorithm fields
    easiness_factor REAL DEFAULT 2.5,
    repetition_count INTEGER DEFAULT 0,
    interval_days INTEGER DEFAULT 1,
    next_review_date TEXT,

    -- Statistics
    times_correct INTEGER DEFAULT 0,
    times_incorrect INTEGER DEFAULT 0,
    last_reviewed_at TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    UNIQUE(item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_items_review ON learning_items(next_review_date);
CREATE INDEX IF NOT EXISTS idx_learning_items_type ON learning_items(item_type);

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update timestamp triggers
CREATE TRIGGER IF NOT EXISTS fire_stations_update_timestamp
AFTER UPDATE ON fire_stations
FOR EACH ROW
BEGIN
    UPDATE fire_stations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS hospitals_update_timestamp
AFTER UPDATE ON hospitals
FOR EACH ROW
BEGIN
    UPDATE hospitals SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS nursing_homes_update_timestamp
AFTER UPDATE ON nursing_homes
FOR EACH ROW
BEGIN
    UPDATE nursing_homes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Calculate quiz score on completion
CREATE TRIGGER IF NOT EXISTS quiz_session_score
AFTER UPDATE OF completed_at ON quiz_sessions
FOR EACH ROW
WHEN NEW.completed_at IS NOT NULL AND NEW.total_questions > 0
BEGIN
    UPDATE quiz_sessions
    SET score_percent = (CAST(NEW.correct_answers AS REAL) / NEW.total_questions) * 100
    WHERE id = NEW.id;
END;
