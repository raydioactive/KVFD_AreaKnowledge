-- ==========================================
-- SpatiaLite Initialization
-- ==========================================
-- This script initializes SpatiaLite extension and spatial metadata
-- Must be run before any other schema files

-- Note: Extension loading is done programmatically in Python
-- This file contains post-initialization setup

-- Initialize spatial metadata (version 1 = create all metadata tables)
SELECT InitSpatialMetadata(1);

-- Enable Write-Ahead Logging for better concurrency
PRAGMA journal_mode=WAL;

-- Improve performance
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=MEMORY;
