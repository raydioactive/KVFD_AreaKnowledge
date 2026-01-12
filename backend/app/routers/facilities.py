"""
Facilities Router
Serves hospitals, nursing homes, and fire station data for Montgomery County
"""
import json
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


def get_gis_data_path() -> Path:
    """Get the path to the GIS data directory."""
    import os
    if data_env := os.environ.get('GIS_DATA_PATH'):
        return Path(data_env)
    project_root = Path(__file__).parent.parent.parent.parent
    return project_root / "data" / "gis"


def load_geojson(filename: str) -> dict:
    """Load a GeoJSON file from the data directory."""
    gis_path = get_gis_data_path()
    file_path = gis_path / filename

    if not file_path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"{filename} not available. Data file missing."
        )

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Invalid data format in {filename}")
    except Exception as e:
        logger.error(f"Error reading {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load {filename}")


# ===========================================
# HOSPITALS
# ===========================================

@router.get("/hospitals")
async def get_hospitals(
    trauma: Optional[bool] = Query(None, description="Filter by trauma center"),
    stemi: Optional[bool] = Query(None, description="Filter by STEMI center"),
    stroke: Optional[bool] = Query(None, description="Filter by stroke center"),
    pediatric: Optional[bool] = Query(None, description="Filter by pediatric capability"),
    helipad: Optional[bool] = Query(None, description="Filter by helipad availability")
):
    """
    Get Montgomery County hospitals with optional capability filters.

    Returns GeoJSON FeatureCollection of hospitals.
    """
    geojson = load_geojson("hospitals.geojson")
    features = geojson.get('features', [])

    # Apply filters
    filtered = features
    if trauma is not None:
        filtered = [f for f in filtered if f['properties'].get('is_trauma_center') == trauma]
    if stemi is not None:
        filtered = [f for f in filtered if f['properties'].get('is_stemi_center') == stemi]
    if stroke is not None:
        filtered = [f for f in filtered if f['properties'].get('is_stroke_center') == stroke]
    if pediatric is not None:
        filtered = [f for f in filtered if f['properties'].get('is_pediatric_center') == pediatric]
    if helipad is not None:
        filtered = [f for f in filtered if f['properties'].get('has_helipad') == helipad]

    result = {
        "type": "FeatureCollection",
        "features": filtered
    }

    logger.info(f"Serving {len(filtered)} hospitals (filtered from {len(features)})")

    return JSONResponse(
        content=result,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.get("/hospitals/capabilities")
async def get_hospital_capabilities():
    """
    Get summary of hospital capabilities in Montgomery County.

    Useful for protocol-driven destination selection.
    """
    geojson = load_geojson("hospitals.geojson")
    features = geojson.get('features', [])

    capabilities = {
        "total_hospitals": len(features),
        "trauma_centers": {
            "total": sum(1 for f in features if f['properties'].get('is_trauma_center')),
            "level_1": sum(1 for f in features if f['properties'].get('trauma_level') == 'I'),
            "level_2": sum(1 for f in features if f['properties'].get('trauma_level') == 'II'),
            "level_3": sum(1 for f in features if f['properties'].get('trauma_level') == 'III'),
        },
        "stemi_centers": sum(1 for f in features if f['properties'].get('is_stemi_center')),
        "stroke_centers": {
            "total": sum(1 for f in features if f['properties'].get('is_stroke_center')),
            "primary": sum(1 for f in features if f['properties'].get('stroke_level') == 'Primary'),
            "comprehensive": sum(1 for f in features if f['properties'].get('stroke_level') == 'Comprehensive'),
        },
        "pediatric_centers": sum(1 for f in features if f['properties'].get('is_pediatric_center')),
        "burn_centers": sum(1 for f in features if f['properties'].get('is_burn_center')),
        "with_helipad": sum(1 for f in features if f['properties'].get('has_helipad')),
        "with_cath_lab": sum(1 for f in features if f['properties'].get('has_cath_lab')),
    }

    return capabilities


@router.get("/hospitals/{hospital_id}")
async def get_hospital(hospital_id: int):
    """Get a specific hospital by ID."""
    geojson = load_geojson("hospitals.geojson")

    for feature in geojson.get('features', []):
        if feature['properties'].get('id') == hospital_id:
            return feature

    raise HTTPException(status_code=404, detail="Hospital not found")


# ===========================================
# FIRE STATIONS
# ===========================================

@router.get("/stations")
async def get_stations(
    station_type: Optional[str] = Query(None, description="Filter by type: career, volunteer, combination")
):
    """
    Get Montgomery County fire stations.

    Returns GeoJSON FeatureCollection of fire stations.
    """
    geojson = load_geojson("fire_stations.geojson")
    features = geojson.get('features', [])

    if station_type:
        features = [f for f in features if f['properties'].get('station_type') == station_type]

    result = {
        "type": "FeatureCollection",
        "features": features
    }

    logger.info(f"Serving {len(features)} fire stations")

    return JSONResponse(
        content=result,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.get("/stations/summary")
async def get_stations_summary():
    """Get summary statistics for fire stations."""
    geojson = load_geojson("fire_stations.geojson")
    features = geojson.get('features', [])

    summary = {
        "total_stations": len(features),
        "by_type": {
            "career": sum(1 for f in features if f['properties'].get('station_type') == 'career'),
            "volunteer": sum(1 for f in features if f['properties'].get('station_type') == 'volunteer'),
            "combination": sum(1 for f in features if f['properties'].get('station_type') == 'combination'),
        },
        "apparatus_counts": {}
    }

    # Count apparatus types
    apparatus_types = {}
    for feature in features:
        apparatus = feature['properties'].get('apparatus', [])
        for a in apparatus:
            apparatus_types[a] = apparatus_types.get(a, 0) + 1
    summary["apparatus_counts"] = apparatus_types

    return summary


@router.get("/stations/{station_number}")
async def get_station(station_number: str):
    """Get a specific fire station by station number."""
    geojson = load_geojson("fire_stations.geojson")

    for feature in geojson.get('features', []):
        if feature['properties'].get('station_number') == station_number:
            return feature

    raise HTTPException(status_code=404, detail="Station not found")


# ===========================================
# NURSING HOMES
# ===========================================

@router.get("/nursing-homes")
async def get_nursing_homes(
    facility_type: Optional[str] = Query(None, description="Filter by type: nursing_home, assisted_living, rehab, memory_care"),
    min_rating: Optional[int] = Query(None, ge=1, le=5, description="Minimum CMS rating (1-5)")
):
    """
    Get Montgomery County nursing homes and long-term care facilities.

    Returns GeoJSON FeatureCollection.
    """
    geojson = load_geojson("nursing_homes.geojson")
    features = geojson.get('features', [])

    if facility_type:
        features = [f for f in features if f['properties'].get('facility_type') == facility_type]

    if min_rating:
        features = [f for f in features if (f['properties'].get('cms_rating') or 0) >= min_rating]

    result = {
        "type": "FeatureCollection",
        "features": features
    }

    logger.info(f"Serving {len(features)} nursing homes")

    return JSONResponse(
        content=result,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.get("/nursing-homes/summary")
async def get_nursing_homes_summary():
    """Get summary statistics for nursing homes."""
    geojson = load_geojson("nursing_homes.geojson")
    features = geojson.get('features', [])

    total_beds = sum(f['properties'].get('bed_count', 0) for f in features)

    summary = {
        "total_facilities": len(features),
        "total_beds": total_beds,
        "by_type": {
            "nursing_home": sum(1 for f in features if f['properties'].get('facility_type') == 'nursing_home'),
            "assisted_living": sum(1 for f in features if f['properties'].get('facility_type') == 'assisted_living'),
            "memory_care": sum(1 for f in features if f['properties'].get('facility_type') == 'memory_care'),
            "rehab": sum(1 for f in features if f['properties'].get('facility_type') == 'rehab'),
        },
        "by_rating": {
            str(i): sum(1 for f in features if f['properties'].get('cms_rating') == i)
            for i in range(1, 6)
        }
    }

    return summary


@router.get("/nursing-homes/{facility_id}")
async def get_nursing_home(facility_id: int):
    """Get a specific nursing home by ID."""
    geojson = load_geojson("nursing_homes.geojson")

    for feature in geojson.get('features', []):
        if feature['properties'].get('id') == facility_id:
            return feature

    raise HTTPException(status_code=404, detail="Facility not found")


# ===========================================
# HEALTH CHECK
# ===========================================

@router.get("/health")
async def facilities_health():
    """Health check for facilities data availability."""
    gis_path = get_gis_data_path()

    files = {
        "hospitals": gis_path / "hospitals.geojson",
        "fire_stations": gis_path / "fire_stations.geojson",
        "nursing_homes": gis_path / "nursing_homes.geojson"
    }

    status = {}
    all_available = True

    for name, path in files.items():
        available = path.exists()
        count = 0
        if available:
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    count = len(data.get('features', []))
            except Exception:
                available = False

        status[name] = {
            "available": available,
            "count": count
        }
        if not available:
            all_available = False

    return {
        "facilities_available": all_available,
        "data_path": str(gis_path),
        "files": status
    }
