"""
GIS Data Router
Serves Montgomery County GIS layers (fire boxes, stations, etc.)
"""
import os
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gis", tags=["gis"])


def get_gis_data_path() -> Path:
    """
    Get the path to the GIS data directory.

    Returns:
        Path: Path to data/gis directory
    """
    # Check environment variable (set by Electron in production)
    if data_env := os.environ.get('GIS_DATA_PATH'):
        logger.info(f"Using GIS_DATA_PATH from env: {data_env}")
        return Path(data_env)

    # Development mode
    project_root = Path(__file__).parent.parent.parent.parent
    gis_path = project_root / "data" / "gis"
    logger.info(f"GIS data path: {gis_path} (from __file__: {__file__})")
    return gis_path


@router.get("/fire-boxes")
async def get_fire_boxes():
    """
    Get Montgomery County fire box boundaries.

    Returns:
        JSONResponse: GeoJSON FeatureCollection of fire boxes

    Raises:
        HTTPException: If fire box data not found or invalid
    """
    gis_path = get_gis_data_path()
    fire_boxes_file = gis_path / "fire_boxes.geojson"

    if not fire_boxes_file.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Fire box data not available. "
                "Please run: python scripts/download_fire_boxes.py"
            )
        )

    try:
        # Log which file we're reading
        logger.info(f"Reading fire boxes from: {fire_boxes_file}")
        logger.info(f"File exists: {fire_boxes_file.exists()}")
        logger.info(f"File size: {fire_boxes_file.stat().st_size / 1024:.1f} KB")

        # Read GeoJSON file
        with open(fire_boxes_file, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)

        # Validate structure
        if 'type' not in geojson_data or geojson_data['type'] != 'FeatureCollection':
            raise HTTPException(
                status_code=500,
                detail="Invalid fire box data format"
            )

        features = geojson_data.get('features', [])

        logger.info(f"Serving {len(features)} fire boxes from {fire_boxes_file}")

        # Return GeoJSON with CORS headers
        return JSONResponse(
            content=geojson_data,
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "Access-Control-Allow-Origin": "*"
            }
        )

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in fire boxes file: {e}")
        raise HTTPException(status_code=500, detail="Invalid fire box data format")
    except Exception as e:
        logger.error(f"Error reading fire boxes: {e}")
        raise HTTPException(status_code=500, detail="Failed to load fire box data")


@router.get("/debug")
async def gis_debug():
    """Debug endpoint to check GIS file status"""
    gis_path = get_gis_data_path()
    fire_boxes_file = gis_path / "fire_boxes.geojson"

    result = {
        "gis_path": str(gis_path),
        "fire_boxes_file": str(fire_boxes_file),
        "file_exists": fire_boxes_file.exists(),
        "__file__": __file__,
    }

    if fire_boxes_file.exists():
        result["file_size_kb"] = round(fire_boxes_file.stat().st_size / 1024, 2)
        try:
            with open(fire_boxes_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                result["feature_count"] = len(data.get('features', []))
        except Exception as e:
            result["error"] = str(e)

    return result


@router.get("/health")
async def gis_health():
    """
    Health check for GIS data availability.

    Returns:
        dict: Status of GIS data files
    """
    gis_path = get_gis_data_path()
    fire_boxes_file = gis_path / "fire_boxes.geojson"

    fire_boxes_available = fire_boxes_file.exists()
    fire_boxes_count = 0

    if fire_boxes_available:
        try:
            with open(fire_boxes_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                fire_boxes_count = len(data.get('features', []))
        except Exception as e:
            logger.error(f"Error reading fire boxes for health check: {e}")
            fire_boxes_available = False

    return {
        "gis_data_available": fire_boxes_available,
        "gis_data_path": str(gis_path),
        "fire_boxes": {
            "available": fire_boxes_available,
            "count": fire_boxes_count,
            "file_size_kb": round(fire_boxes_file.stat().st_size / 1024, 2) if fire_boxes_available else 0
        }
    }


@router.get("/routing-instabilities/{station_pattern}")
async def get_routing_instabilities(station_pattern: str):
    """
    Get routing instability zones for a station.

    Args:
        station_pattern: Station pattern (e.g., "05" for Station 5)

    Returns:
        JSONResponse: GeoJSON FeatureCollection of instability zones
    """
    gis_path = get_gis_data_path()

    # Ensure pattern is 2 digits
    pattern = station_pattern.zfill(2)
    instability_file = gis_path / f"routing_instabilities_{pattern}.geojson"

    if not instability_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No routing instability data for station {pattern}. Run: python scripts/find_routing_instabilities.py --station {pattern}"
        )

    try:
        with open(instability_file, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)

        features = geojson_data.get('features', [])
        props = geojson_data.get('properties', {})

        logger.info(f"Serving {len(features)} instability features for station {pattern}")
        logger.info(f"  Critical: {props.get('critical_count', 0)}, High: {props.get('high_count', 0)}, Medium: {props.get('medium_count', 0)}")

        return JSONResponse(
            content=geojson_data,
            headers={
                "Cache-Control": "public, max-age=300",  # Cache for 5 minutes
                "Access-Control-Allow-Origin": "*"
            }
        )

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in instability file: {e}")
        raise HTTPException(status_code=500, detail="Invalid instability data format")
    except Exception as e:
        logger.error(f"Error reading instability data: {e}")
        raise HTTPException(status_code=500, detail="Failed to load instability data")


@router.get("/layers")
async def list_layers():
    """
    List available GIS layers.

    Returns:
        dict: Available GIS layers and their status
    """
    gis_path = get_gis_data_path()

    layers = {
        "fire_boxes": {
            "name": "Fire Boxes",
            "endpoint": "/api/gis/fire-boxes",
            "available": (gis_path / "fire_boxes.geojson").exists(),
            "type": "polygon",
            "description": "Montgomery County fire box boundaries"
        },
        "routing_instabilities": {
            "name": "Routing Instabilities",
            "endpoint": "/api/gis/routing-instabilities/{station}",
            "available": any(gis_path.glob("routing_instabilities_*.geojson")),
            "type": "point",
            "description": "Locations where routing may be unreliable"
        }
    }

    return {
        "layers": layers,
        "available_count": sum(1 for layer in layers.values() if layer['available']),
        "total_count": len(layers)
    }
