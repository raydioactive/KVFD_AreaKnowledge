"""
Quiz Router
Serves quiz questions for EMS training
"""
import json
import random
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


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
        return {"type": "FeatureCollection", "features": []}

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error reading {filename}: {e}")
        return {"type": "FeatureCollection", "features": []}


def point_in_polygon(point: list, polygon: list) -> bool:
    """Ray casting algorithm to check if point is inside polygon."""
    x, y = point[0], point[1]
    inside = False

    n = len(polygon)
    j = n - 1

    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]

        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i

    return inside


def point_in_fire_boxes(point: list, fire_boxes: list) -> bool:
    """Check if a point is within any of the given fire boxes."""
    for box in fire_boxes:
        geometry = box.get('geometry', {})
        if geometry.get('type') == 'Polygon':
            if point_in_polygon(point, geometry['coordinates'][0]):
                return True
        elif geometry.get('type') == 'MultiPolygon':
            for polygon in geometry['coordinates']:
                if point_in_polygon(point, polygon[0]):
                    return True
    return False


class AddressQuestion(BaseModel):
    id: str
    address: str
    city: str
    state: str
    zip: str
    full_address: str
    location: List[float]  # [lng, lat]
    facility_type: str
    facility_name: str
    difficulty: str  # easy, medium, hard


@router.get("/address-questions")
async def get_address_questions(
    station_pattern: Optional[str] = Query(None, description="Station pattern (e.g., '05' for station 5)"),
    count: int = Query(10, ge=1, le=50, description="Number of questions"),
    include_facilities: bool = Query(False, description="Include hospitals, stations, nursing homes"),
    addresses_only: bool = Query(True, description="Use real street addresses")
):
    """
    Get address quiz questions for a station's first-due area.

    Returns a list of addresses with their actual locations for GeoGuessr-style quizzing.
    Uses real geocoded addresses from Maryland iMAP data.
    """
    questions = []

    # Load fire boxes if station pattern is specified
    first_due_boxes = []
    if station_pattern:
        fire_boxes_data = load_geojson("fire_boxes.geojson")
        first_due_boxes = [
            box for box in fire_boxes_data.get('features', [])
            if box.get('properties', {}).get('BEAT', '').startswith(station_pattern)
        ]
        logger.info(f"Found {len(first_due_boxes)} first-due boxes for pattern {station_pattern}")

    # Load real addresses from addresses.geojson
    if addresses_only:
        addresses_data = load_geojson("addresses.geojson")
        all_addresses = addresses_data.get('features', [])

        if all_addresses:
            # Filter by station pattern if specified
            if station_pattern:
                # Filter addresses that have a beat starting with the pattern
                # OR are within the first-due fire boxes
                filtered = []
                for addr in all_addresses:
                    props = addr.get('properties', {})
                    beat = props.get('beat', '')

                    # Check if beat matches pattern
                    if beat and beat.startswith(station_pattern):
                        filtered.append(addr)
                    # Or check if point is in fire boxes
                    elif first_due_boxes:
                        coords = addr.get('geometry', {}).get('coordinates', [])
                        if coords and point_in_fire_boxes(coords, first_due_boxes):
                            filtered.append(addr)

                all_addresses = filtered
                logger.info(f"Filtered to {len(all_addresses)} addresses for pattern {station_pattern}")

            # Convert to quiz questions
            for addr in all_addresses:
                props = addr.get('properties', {})
                coords = addr.get('geometry', {}).get('coordinates', [0, 0])

                address_str = props.get('address', '')
                if not address_str:
                    # Build address from components
                    street_num = props.get('street_number', '')
                    street_name = props.get('street_name', '')
                    address_str = f"{street_num} {street_name}".strip()

                if not address_str:
                    continue

                questions.append({
                    "id": f"addr-{hash(address_str) % 100000}",
                    "address": address_str,
                    "city": props.get('city', ''),
                    "state": "MD",
                    "zip": props.get('zip', ''),
                    "full_address": f"{address_str}, {props.get('city', '')}, MD {props.get('zip', '')}",
                    "location": coords,
                    "facility_type": "address",
                    "facility_name": "",
                    "difficulty": "medium",
                    "beat": props.get('beat', '')
                })

            logger.info(f"Loaded {len(questions)} address questions from addresses.geojson")

    # Fallback to facilities if no addresses or explicitly requested
    if include_facilities or not questions:
        # Load all facility types
        hospitals = load_geojson("hospitals.geojson").get('features', [])
        stations = load_geojson("fire_stations.geojson").get('features', [])
        nursing_homes = load_geojson("nursing_homes.geojson").get('features', [])

        # Filter by first-due area if station pattern specified
        if station_pattern and first_due_boxes:
            hospitals = [h for h in hospitals if point_in_fire_boxes(h['geometry']['coordinates'], first_due_boxes)]
            stations = [s for s in stations if point_in_fire_boxes(s['geometry']['coordinates'], first_due_boxes)]
            nursing_homes = [n for n in nursing_homes if point_in_fire_boxes(n['geometry']['coordinates'], first_due_boxes)]

        # Add hospital questions
        for h in hospitals:
            props = h.get('properties', {})
            questions.append({
                "id": f"hospital-{props.get('id', '')}",
                "address": props.get('address', ''),
                "city": props.get('city', ''),
                "state": props.get('state', 'MD'),
                "zip": props.get('zip', ''),
                "full_address": f"{props.get('address', '')}, {props.get('city', '')}, MD {props.get('zip', '')}",
                "location": h['geometry']['coordinates'],
                "facility_type": "hospital",
                "facility_name": props.get('name', ''),
                "difficulty": "easy"
            })

        # Add fire station questions
        for s in stations:
            props = s.get('properties', {})
            questions.append({
                "id": f"station-{props.get('station_number', '')}",
                "address": props.get('address', ''),
                "city": props.get('city', ''),
                "state": props.get('state', 'MD'),
                "zip": props.get('zip', ''),
                "full_address": f"{props.get('address', '')}, {props.get('city', '')}, MD {props.get('zip', '')}",
                "location": s['geometry']['coordinates'],
                "facility_type": "fire_station",
                "facility_name": props.get('station_name', f"Station {props.get('station_number', '')}"),
                "difficulty": "easy"
            })

        # Add nursing home questions
        for n in nursing_homes:
            props = n.get('properties', {})
            questions.append({
                "id": f"nursing-{props.get('id', '')}",
                "address": props.get('address', ''),
                "city": props.get('city', ''),
                "state": props.get('state', 'MD'),
                "zip": props.get('zip', ''),
                "full_address": f"{props.get('address', '')}, {props.get('city', '')}, MD {props.get('zip', '')}",
                "location": n['geometry']['coordinates'],
                "facility_type": "nursing_home",
                "facility_name": props.get('name', ''),
                "difficulty": "medium"
            })

    # Shuffle and limit
    random.shuffle(questions)
    questions = questions[:count]

    logger.info(f"Returning {len(questions)} address questions for pattern {station_pattern or 'all'}")

    return JSONResponse(
        content={
            "station_pattern": station_pattern,
            "total_available": len(questions),
            "questions": questions
        },
        headers={
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.get("/address-questions/count")
async def get_address_count(
    station_pattern: Optional[str] = Query(None, description="Station pattern")
):
    """Get count of available address questions for a station area."""
    # Load fire boxes if station pattern is specified
    first_due_boxes = []
    if station_pattern:
        fire_boxes_data = load_geojson("fire_boxes.geojson")
        first_due_boxes = [
            box for box in fire_boxes_data.get('features', [])
            if box.get('properties', {}).get('BEAT', '').startswith(station_pattern)
        ]

    # Load facilities
    hospitals = load_geojson("hospitals.geojson").get('features', [])
    stations = load_geojson("fire_stations.geojson").get('features', [])
    nursing_homes = load_geojson("nursing_homes.geojson").get('features', [])

    # Filter by first-due area if station pattern specified
    if station_pattern and first_due_boxes:
        hospitals = [h for h in hospitals if point_in_fire_boxes(h['geometry']['coordinates'], first_due_boxes)]
        stations = [s for s in stations if point_in_fire_boxes(s['geometry']['coordinates'], first_due_boxes)]
        nursing_homes = [n for n in nursing_homes if point_in_fire_boxes(n['geometry']['coordinates'], first_due_boxes)]

    return {
        "station_pattern": station_pattern,
        "counts": {
            "hospitals": len(hospitals),
            "fire_stations": len(stations),
            "nursing_homes": len(nursing_homes),
            "total": len(hospitals) + len(stations) + len(nursing_homes)
        }
    }
