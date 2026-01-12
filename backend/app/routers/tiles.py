"""
Tile Server Router
Serves map tiles from MBTiles SQLite database for offline use
"""
import os
import sqlite3
from pathlib import Path
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import Response as FastAPIResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tiles", tags=["tiles"])


def get_tiles_path() -> Path:
    """
    Get the path to the MBTiles file.

    Returns:
        Path: Path to maryland.mbtiles file
    """
    # Check environment variable (set by Electron in production)
    if tiles_env := os.environ.get('TILES_PATH'):
        return Path(tiles_env) / "maryland.mbtiles"

    # Development mode
    project_root = Path(__file__).parent.parent.parent.parent
    return project_root / "tiles" / "maryland.mbtiles"


def get_tile_from_mbtiles(z: int, x: int, y: int) -> bytes | None:
    """
    Retrieve a tile from the MBTiles database.

    MBTiles uses TMS (Tile Map Service) coordinate system,
    while MapLibre uses XYZ (slippy map) tiles.
    We need to convert: tms_y = (2^z - 1) - y

    Args:
        z: Zoom level
        x: Tile X coordinate (XYZ)
        y: Tile Y coordinate (XYZ)

    Returns:
        bytes: Tile data (PBF format for vector tiles)
        None: If tile not found
    """
    tiles_path = get_tiles_path()

    if not tiles_path.exists():
        logger.error(f"MBTiles file not found: {tiles_path}")
        return None

    try:
        # Convert XYZ to TMS coordinates
        tms_y = (2 ** z - 1) - y

        # Connect to MBTiles database
        conn = sqlite3.connect(str(tiles_path))
        cursor = conn.cursor()

        # Query tile data
        cursor.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
            (z, x, tms_y)
        )

        result = cursor.fetchone()
        conn.close()

        if result:
            return result[0]
        else:
            logger.debug(f"Tile not found: z={z}, x={x}, y={y} (tms_y={tms_y})")
            return None

    except sqlite3.Error as e:
        logger.error(f"Database error retrieving tile: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error retrieving tile: {e}")
        return None


@router.get("/{z}/{x}/{y}.pbf")
async def get_tile(z: int, x: int, y: int):
    """
    Get a map tile in PBF (Protobuf) format.

    Args:
        z: Zoom level (0-14 typically)
        x: Tile X coordinate
        y: Tile Y coordinate

    Returns:
        Response: Tile data with appropriate headers

    Raises:
        HTTPException: If tile not found or invalid coordinates
    """
    # Validate coordinates
    if z < 0 or z > 20:
        raise HTTPException(status_code=400, detail="Invalid zoom level")

    max_coord = 2 ** z
    if x < 0 or x >= max_coord or y < 0 or y >= max_coord:
        raise HTTPException(status_code=400, detail="Invalid tile coordinates")

    # Get tile data
    tile_data = get_tile_from_mbtiles(z, x, y)

    if tile_data is None:
        # Check if MBTiles file exists
        tiles_path = get_tiles_path()
        if not tiles_path.exists():
            raise HTTPException(
                status_code=503,
                detail=f"Map tiles not available. Please run: python scripts/download_tiles.py"
            )

        # Tile exists in database but not found - return 204 No Content
        return Response(status_code=204)

    # Return tile with appropriate headers
    return Response(
        content=tile_data,
        media_type="application/x-protobuf",
        headers={
            "Content-Encoding": "gzip",  # MBTiles tiles are typically gzip-compressed
            "Cache-Control": "public, max-age=86400",  # Cache for 24 hours
        }
    )


@router.get("/metadata")
async def get_metadata():
    """
    Get metadata about the tileset.

    Returns:
        dict: Tileset metadata (name, bounds, center, etc.)
    """
    tiles_path = get_tiles_path()

    if not tiles_path.exists():
        raise HTTPException(
            status_code=503,
            detail="Map tiles not available. Please download tiles first."
        )

    try:
        conn = sqlite3.connect(str(tiles_path))
        cursor = conn.cursor()

        # Get metadata from MBTiles
        cursor.execute("SELECT name, value FROM metadata")
        metadata = {row[0]: row[1] for row in cursor.fetchall()}

        # Get tile statistics
        cursor.execute("SELECT COUNT(*) FROM tiles")
        tile_count = cursor.fetchone()[0]

        cursor.execute("SELECT MIN(zoom_level), MAX(zoom_level) FROM tiles")
        min_zoom, max_zoom = cursor.fetchone()

        conn.close()

        return {
            "metadata": metadata,
            "stats": {
                "tile_count": tile_count,
                "min_zoom": min_zoom,
                "max_zoom": max_zoom
            },
            "file_size_mb": round(tiles_path.stat().st_size / (1024 * 1024), 2),
            "available": True
        }

    except Exception as e:
        logger.error(f"Error reading metadata: {e}")
        raise HTTPException(status_code=500, detail="Failed to read tileset metadata")


@router.get("/health")
async def tile_health():
    """
    Health check for tile server.

    Returns:
        dict: Health status
    """
    tiles_path = get_tiles_path()
    exists = tiles_path.exists()

    return {
        "tiles_available": exists,
        "tiles_path": str(tiles_path),
        "file_exists": exists,
        "file_size_mb": round(tiles_path.stat().st_size / (1024 * 1024), 2) if exists else 0
    }
