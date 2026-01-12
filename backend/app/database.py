"""
Database configuration and initialization for SQLite + SpatiaLite.
"""
import os
import sqlite3
from pathlib import Path
from typing import Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_database_path() -> str:
    """
    Get the database file path.
    In development: ./database/ems_trainer.db
    In production (Electron): %APPDATA%/moco-ems-trainer/ems_trainer.db
    """
    # Check if running from PyInstaller bundle
    if os.environ.get('DATABASE_PATH'):
        return os.environ.get('DATABASE_PATH')

    # Development mode
    project_root = Path(__file__).parent.parent.parent
    db_path = project_root / "database" / "ems_trainer.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return str(db_path)


def load_spatialite(conn: sqlite3.Connection) -> None:
    """
    Load the SpatiaLite extension into the SQLite connection.

    Args:
        conn: SQLite connection object

    Raises:
        Exception: If SpatiaLite cannot be loaded
    """
    # Enable loading extensions
    conn.enable_load_extension(True)

    try:
        # Try common SpatiaLite library names
        library_names = [
            'mod_spatialite',  # Windows
            'mod_spatialite.dll',  # Windows explicit
            'libspatialite.so',  # Linux
            'libspatialite.dylib',  # macOS
        ]

        loaded = False
        for lib_name in library_names:
            try:
                conn.load_extension(lib_name)
                loaded = True
                logger.info(f"Successfully loaded SpatiaLite: {lib_name}")
                break
            except Exception:
                continue

        if not loaded:
            raise Exception("Could not load SpatiaLite extension. Please ensure SpatiaLite is installed.")

    finally:
        # Disable loading extensions for security
        conn.enable_load_extension(False)


def get_connection() -> sqlite3.Connection:
    """
    Get a database connection with SpatiaLite loaded.

    Returns:
        sqlite3.Connection: Database connection with SpatiaLite extension
    """
    db_path = get_database_path()
    conn = sqlite3.connect(db_path)

    # Load SpatiaLite
    load_spatialite(conn)

    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def run_sql_file(conn: sqlite3.Connection, sql_file: Path) -> None:
    """
    Execute a SQL file.

    Args:
        conn: Database connection
        sql_file: Path to SQL file

    Raises:
        FileNotFoundError: If SQL file doesn't exist
    """
    if not sql_file.exists():
        raise FileNotFoundError(f"SQL file not found: {sql_file}")

    logger.info(f"Running SQL file: {sql_file.name}")

    with open(sql_file, 'r', encoding='utf-8') as f:
        sql_script = f.read()

    # Execute the SQL script
    conn.executescript(sql_script)
    conn.commit()

    logger.info(f"Successfully executed: {sql_file.name}")


def initialize_database(force: bool = False) -> None:
    """
    Initialize the database by running all schema files.

    Args:
        force: If True, drop existing database and recreate

    Raises:
        Exception: If initialization fails
    """
    db_path = get_database_path()

    # Drop existing database if force=True
    if force and os.path.exists(db_path):
        logger.warning(f"Dropping existing database: {db_path}")
        os.remove(db_path)

    # Check if database already exists
    db_exists = os.path.exists(db_path)

    if db_exists and not force:
        logger.info("Database already exists. Use force=True to recreate.")
        return

    logger.info(f"Initializing database at: {db_path}")

    # Create connection
    conn = get_connection()

    try:
        # Get schema directory
        project_root = Path(__file__).parent.parent.parent
        schema_dir = project_root / "database" / "schema"

        if not schema_dir.exists():
            raise FileNotFoundError(f"Schema directory not found: {schema_dir}")

        # Get all SQL files in order
        sql_files = sorted(schema_dir.glob("*.sql"))

        if not sql_files:
            raise FileNotFoundError(f"No SQL files found in: {schema_dir}")

        # Run each SQL file in order
        for sql_file in sql_files:
            run_sql_file(conn, sql_file)

        logger.info("Database initialization complete!")

    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

    finally:
        conn.close()


def check_database() -> bool:
    """
    Check if the database is initialized and has SpatiaLite loaded.

    Returns:
        bool: True if database is ready, False otherwise
    """
    try:
        db_path = get_database_path()

        if not os.path.exists(db_path):
            logger.warning("Database file does not exist")
            return False

        conn = get_connection()

        # Check if spatial metadata exists
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='spatial_ref_sys'"
        )
        result = cursor.fetchone()

        conn.close()

        if result:
            logger.info("Database is initialized and ready")
            return True
        else:
            logger.warning("Database exists but SpatiaLite is not initialized")
            return False

    except Exception as e:
        logger.error(f"Database check failed: {e}")
        return False


if __name__ == "__main__":
    """Run database initialization from command line"""
    import sys

    force = "--force" in sys.argv

    if check_database() and not force:
        print("Database is already initialized.")
        print("Use --force to recreate the database.")
    else:
        initialize_database(force=force)
        print("Database initialized successfully!")
