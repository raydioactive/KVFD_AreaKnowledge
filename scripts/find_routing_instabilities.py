#!/usr/bin/env python3
"""
Routing Instability Detector

Finds locations where nearby addresses produce dramatically different routes
from the fire station - potential misrouting hazards.

Usage:
    python scripts/find_routing_instabilities.py --station 05
    python scripts/find_routing_instabilities.py --station 05 --bearing-threshold 90
"""

import argparse
import json
import math
import sys
from pathlib import Path
from dataclasses import dataclass
from typing import Optional
import requests
from scipy.spatial import KDTree
import numpy as np

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
GIS_DIR = DATA_DIR / "gis"


@dataclass
class RouteSignature:
    """Captures key characteristics of a route for comparison."""
    address_id: str
    address: str
    location: tuple[float, float]  # (lng, lat)
    initial_bearing: float  # Bearing leaving the station (0-360)
    first_road: str  # Name of first road after leaving station
    route_roads: list  # List of road names in order
    route_geometry: list  # Full route coordinates
    total_distance: float  # meters
    total_duration: float  # seconds
    has_uturn: bool  # Route contains U-turn
    success: bool
    error: Optional[str] = None


@dataclass
class InstabilityZone:
    """A pair of nearby addresses with dramatically different routes."""
    address1: RouteSignature
    address2: RouteSignature
    distance_apart: float  # meters between the two addresses
    bearing_difference: float  # degrees difference in initial bearing
    route_overlap: float  # 0-1, percentage of route that overlaps
    route_distance_ratio: float  # ratio of longer/shorter route distance
    severity: str  # "critical", "high", "medium"
    reason: str  # Why this was flagged


def load_addresses(station_pattern: str) -> list[dict]:
    """Load addresses for a station's first-due area."""
    # Try station-specific file first (check both gis/ and data/ directories)
    for base_dir in [GIS_DIR, DATA_DIR]:
        station_file = base_dir / f"addresses_station_{station_pattern}.geojson"
        if station_file.exists():
            print(f"Loading addresses from {station_file}")
            with open(station_file) as f:
                data = json.load(f)
                return data.get("features", [])

    # Fall back to general addresses file and filter
    for base_dir in [GIS_DIR, DATA_DIR]:
        general_file = base_dir / "addresses.geojson"
        if general_file.exists():
            print(f"Loading addresses from {general_file} (filtering by station {station_pattern})")
            with open(general_file) as f:
                data = json.load(f)
                features = data.get("features", [])
                # Filter by beat pattern if available
                filtered = [f for f in features if f.get("properties", {}).get("beat", "").startswith(station_pattern)]
                if filtered:
                    return filtered
                return features  # Return all if no beat info

    print(f"ERROR: No address data found. Run download_addresses.py first.")
    sys.exit(1)


def get_station_location(station_pattern: str) -> tuple[float, float]:
    """Get the station's coordinates."""
    # Load stations data
    stations_file = DATA_DIR / "facilities" / "fire_stations.json"
    if stations_file.exists():
        with open(stations_file) as f:
            stations = json.load(f)
            for station in stations:
                # Match by station number
                station_num = station.get("station_number", "")
                if station_num.zfill(2) == station_pattern:
                    return (station["longitude"], station["latitude"])

    # Hardcoded station locations (actual addresses)
    STATION_COORDS = {
        "05": (-77.07621749, 39.03006067),  # Station 5 - 10620 Connecticut Ave, Kensington
    }

    if station_pattern in STATION_COORDS:
        return STATION_COORDS[station_pattern]

    print(f"WARNING: Could not find station {station_pattern} location, using county center")
    return (-77.1528, 39.1434)


def calculate_bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate initial bearing from point 1 to point 2 in degrees (0-360)."""
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])

    d_lng = lng2 - lng1
    x = math.sin(d_lng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lng)

    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360

    return bearing


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance between two points in meters."""
    R = 6371000  # Earth's radius in meters

    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def get_route_graphhopper(base_url: str, start: tuple[float, float], end: tuple[float, float]) -> Optional[dict]:
    """Get route from GraphHopper."""
    url = f"{base_url}/route"
    params = {
        "point": [f"{start[1]},{start[0]}", f"{end[1]},{end[0]}"],  # GraphHopper uses lat,lng
        "profile": "car",
        "points_encoded": "false",  # Get GeoJSON coordinates
        "instructions": "true"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("paths"):
                path = data["paths"][0]
                # Convert to common format
                return {
                    "geometry": {
                        "coordinates": path.get("points", {}).get("coordinates", [])
                    },
                    "distance": path.get("distance", 0),
                    "duration": path.get("time", 0) / 1000,  # ms to seconds
                    "legs": [{
                        "steps": path.get("instructions", [])
                    }]
                }
    except Exception as e:
        pass

    return None


def get_route_osrm(base_url: str, start: tuple[float, float], end: tuple[float, float]) -> Optional[dict]:
    """Get route from OSRM."""
    url = f"{base_url}/route/v1/driving/{start[0]},{start[1]};{end[0]},{end[1]}"
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "true"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "Ok" and data.get("routes"):
                return data["routes"][0]
    except Exception as e:
        pass

    return None


def get_route(base_url: str, start: tuple[float, float], end: tuple[float, float], engine: str = "graphhopper") -> Optional[dict]:
    """Get route from routing engine."""
    if engine == "graphhopper":
        return get_route_graphhopper(base_url, start, end)
    else:
        return get_route_osrm(base_url, start, end)


def extract_route_signature(
    address_id: str,
    address: str,
    location: tuple[float, float],
    station_loc: tuple[float, float],
    routing_url: str,
    routing_engine: str = "graphhopper"
) -> RouteSignature:
    """Calculate route and extract signature for comparison."""
    route = get_route(routing_url, station_loc, location, routing_engine)

    if not route:
        return RouteSignature(
            address_id=address_id,
            address=address,
            location=location,
            initial_bearing=0,
            first_road="",
            route_roads=[],
            route_geometry=[],
            total_distance=0,
            total_duration=0,
            has_uturn=False,
            success=False,
            error="Failed to get route"
        )

    geometry = route.get("geometry", {}).get("coordinates", [])
    legs = route.get("legs", [{}])
    steps = legs[0].get("steps", []) if legs else []

    # Calculate initial bearing from first two points of route
    initial_bearing = 0
    if len(geometry) >= 2:
        p1 = geometry[0]
        p2 = geometry[1]
        initial_bearing = calculate_bearing(p1[1], p1[0], p2[1], p2[0])

    # Get first road name (skip the first "depart" step)
    # GraphHopper uses "street_name", OSRM uses "name"
    first_road = ""
    route_roads = []
    has_uturn = False

    for step in steps:
        road_name = step.get("street_name", step.get("name", ""))
        text = step.get("text", "").lower()

        # Check for U-turn
        if "u-turn" in text:
            has_uturn = True

        # Collect road names
        if road_name and (not route_roads or road_name != route_roads[-1]):
            route_roads.append(road_name)

        # Get first road
        if not first_road and road_name and len(route_roads) <= 2:
            first_road = road_name

    return RouteSignature(
        address_id=address_id,
        address=address,
        location=location,
        initial_bearing=initial_bearing,
        first_road=first_road,
        route_roads=route_roads,
        route_geometry=geometry,
        total_distance=route.get("distance", 0),
        total_duration=route.get("duration", 0),
        has_uturn=has_uturn,
        success=True
    )


def calculate_route_overlap(route1: list, route2: list, threshold_m: float = 50) -> float:
    """
    Calculate what percentage of route1 is within threshold_m of route2.
    Returns 0-1 overlap score.
    """
    if not route1 or not route2:
        return 0.0

    # Sample points from route1
    matches = 0
    total = len(route1)

    for p1 in route1:
        # Check if any point in route2 is within threshold
        for p2 in route2:
            dist = haversine_distance(p1[1], p1[0], p2[1], p2[0])
            if dist <= threshold_m:
                matches += 1
                break

    return matches / total if total > 0 else 0.0


def find_instabilities(
    signatures: list[RouteSignature],
    addresses_coords: np.ndarray,
    bearing_threshold: float = 90,
    overlap_threshold: float = 0.5,
    max_neighbor_distance: float = 100  # meters
) -> list[InstabilityZone]:
    """Find pairs of nearby addresses with dramatically different routes."""

    # Build KD-tree for fast neighbor lookup
    # Note: KDTree uses Euclidean distance, so we need to convert to approximate meters
    # At 39°N latitude, 1 degree lat ≈ 111km, 1 degree lng ≈ 85km
    lat_scale = 111000
    lng_scale = 85000

    scaled_coords = addresses_coords.copy()
    scaled_coords[:, 0] *= lng_scale  # longitude
    scaled_coords[:, 1] *= lat_scale  # latitude

    tree = KDTree(scaled_coords)

    instabilities = []
    checked_pairs = set()

    for i, sig1 in enumerate(signatures):
        if not sig1.success:
            continue

        # Find neighbors within max_neighbor_distance
        point = scaled_coords[i]
        neighbor_indices = tree.query_ball_point(point, max_neighbor_distance)

        for j in neighbor_indices:
            if i >= j:  # Avoid duplicates and self-comparison
                continue

            pair_key = (min(i, j), max(i, j))
            if pair_key in checked_pairs:
                continue
            checked_pairs.add(pair_key)

            sig2 = signatures[j]
            if not sig2.success:
                continue

            # Calculate actual distance between addresses
            dist = haversine_distance(
                sig1.location[1], sig1.location[0],
                sig2.location[1], sig2.location[0]
            )

            # Calculate bearing difference
            bearing_diff = abs(sig1.initial_bearing - sig2.initial_bearing)
            if bearing_diff > 180:
                bearing_diff = 360 - bearing_diff

            # Calculate route overlap
            overlap = calculate_route_overlap(sig1.route_geometry, sig2.route_geometry)

            # Determine if this is an instability
            is_instability = False
            severity = "medium"

            # Check for different route characteristics
            distance_diff = abs(sig1.total_distance - sig2.total_distance)
            distance_ratio = max(sig1.total_distance, sig2.total_distance) / max(min(sig1.total_distance, sig2.total_distance), 1)
            roads_differ = sig1.route_roads[:3] != sig2.route_roads[:3]  # First 3 roads differ
            uturn_mismatch = sig1.has_uturn != sig2.has_uturn

            reason = ""
            if bearing_diff >= bearing_threshold:
                # Different initial direction - this is the dangerous case!
                is_instability = True
                severity = "critical" if bearing_diff >= 150 else "high"
                reason = f"Opposite initial direction ({bearing_diff:.0f}° diff)"
            elif uturn_mismatch:
                # One route has U-turn, other doesn't - suspicious!
                is_instability = True
                severity = "critical" if distance_ratio > 1.3 else "high"
                uturn_addr = sig1.address if sig1.has_uturn else sig2.address
                reason = f"U-turn route mismatch (one has U-turn, {distance_ratio:.1f}x longer)"
            elif roads_differ and distance_ratio > 1.2:
                # Different roads AND significantly longer route
                is_instability = True
                severity = "high" if distance_ratio > 1.4 else "medium"
                reason = f"Different roads ({distance_ratio:.1f}x distance diff)"
            elif bearing_diff >= 45 and overlap < 0.4:
                # Moderate bearing diff + low overlap = potential issue
                is_instability = True
                severity = "high"
                reason = f"Bearing diff {bearing_diff:.0f}° + low overlap"
            elif bearing_diff >= 30 and overlap < overlap_threshold:
                # Slight bearing diff + very low overlap
                is_instability = True
                severity = "medium"
                reason = f"Bearing diff {bearing_diff:.0f}° + low overlap"

            if is_instability:
                instabilities.append(InstabilityZone(
                    address1=sig1,
                    address2=sig2,
                    distance_apart=dist,
                    route_distance_ratio=distance_ratio,
                    reason=reason,
                    bearing_difference=bearing_diff,
                    route_overlap=overlap,
                    severity=severity
                ))

    return instabilities


def export_results(
    instabilities: list[InstabilityZone],
    output_file: Path,
    station_pattern: str
):
    """Export results as GeoJSON for visualization."""

    features = []

    # Add instability zones as lines connecting the two addresses
    for idx, zone in enumerate(instabilities):
        # Line connecting the two addresses
        line_feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    list(zone.address1.location),
                    list(zone.address2.location)
                ]
            },
            "properties": {
                "type": "instability_zone",
                "id": idx,
                "severity": zone.severity,
                "address1": zone.address1.address,
                "address2": zone.address2.address,
                "distance_apart_m": round(zone.distance_apart, 1),
                "bearing_difference": round(zone.bearing_difference, 1),
                "route_overlap": round(zone.route_overlap, 2),
                "initial_bearing_1": round(zone.address1.initial_bearing, 1),
                "initial_bearing_2": round(zone.address2.initial_bearing, 1),
                "first_road_1": zone.address1.first_road,
                "first_road_2": zone.address2.first_road,
                "route_roads_1": zone.address1.route_roads[:5],
                "route_roads_2": zone.address2.route_roads[:5],
                "route_distance_1": zone.address1.total_distance,
                "route_distance_2": zone.address2.total_distance,
                "route_distance_ratio": round(zone.route_distance_ratio, 2),
                "has_uturn_1": zone.address1.has_uturn,
                "has_uturn_2": zone.address2.has_uturn,
                "reason": zone.reason
            }
        }
        features.append(line_feature)

        # Point markers for each address in the pair
        for i, addr in enumerate([zone.address1, zone.address2]):
            point_feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": list(addr.location)
                },
                "properties": {
                    "type": "instability_address",
                    "zone_id": idx,
                    "severity": zone.severity,
                    "reason": zone.reason,
                    "address": addr.address,
                    "initial_bearing": round(addr.initial_bearing, 1),
                    "first_road": addr.first_road,
                    "route_roads": addr.route_roads[:5],
                    "route_distance": addr.total_distance,
                    "has_uturn": addr.has_uturn,
                    "pair_index": i + 1
                }
            }
            features.append(point_feature)

    geojson = {
        "type": "FeatureCollection",
        "properties": {
            "station_pattern": station_pattern,
            "total_instabilities": len(instabilities),
            "critical_count": len([z for z in instabilities if z.severity == "critical"]),
            "high_count": len([z for z in instabilities if z.severity == "high"]),
            "medium_count": len([z for z in instabilities if z.severity == "medium"])
        },
        "features": features
    }

    with open(output_file, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"\nResults saved to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Find routing instability zones")
    parser.add_argument("--station", required=True, help="Station pattern (e.g., 05)")
    parser.add_argument("--routing-url", default="http://127.0.0.1:8989", help="Routing server URL")
    parser.add_argument("--engine", choices=["graphhopper", "osrm"], default="graphhopper",
                        help="Routing engine (default: graphhopper)")
    parser.add_argument("--bearing-threshold", type=float, default=90,
                        help="Bearing difference (degrees) to flag as instability")
    parser.add_argument("--overlap-threshold", type=float, default=0.5,
                        help="Route overlap below this is flagged (0-1)")
    parser.add_argument("--max-neighbor-distance", type=float, default=50,
                        help="Max distance (meters) between addresses to compare")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of addresses to analyze (for testing)")
    parser.add_argument("--output", type=str, default=None,
                        help="Output file path (default: data/routing_instabilities_XX.geojson)")

    args = parser.parse_args()

    # Ensure station pattern is 2 digits
    station_pattern = args.station.zfill(2)

    print(f"=== Routing Instability Detector ===")
    print(f"Station: {station_pattern}")
    print(f"Routing engine: {args.engine} at {args.routing_url}")
    print(f"Bearing threshold: {args.bearing_threshold}°")
    print(f"Overlap threshold: {args.overlap_threshold}")
    print(f"Max neighbor distance: {args.max_neighbor_distance}m")
    print()

    # Load addresses
    addresses = load_addresses(station_pattern)
    print(f"Loaded {len(addresses)} addresses")

    if args.limit:
        addresses = addresses[:args.limit]
        print(f"Limited to {len(addresses)} addresses for testing")

    # Get station location
    station_loc = get_station_location(station_pattern)
    print(f"Station location: {station_loc}")

    # Test routing engine connection
    print(f"\nTesting {args.engine} at {args.routing_url}...")
    try:
        # Try a test route near the station
        test_end = (station_loc[0] + 0.001, station_loc[1] + 0.001)
        test_route = get_route(args.routing_url, station_loc, test_end, args.engine)
        if test_route is None:
            raise Exception("Test route returned None")
    except Exception as e:
        print(f"WARNING: Could not connect to {args.engine} at {args.routing_url}")
        print(f"Error: {e}")
        if args.engine == "graphhopper":
            print("\nMake sure GraphHopper is running.")
            print("Check: http://127.0.0.1:8989/maps/")
        else:
            print("\nTo start OSRM:")
            print("  docker run -t -i -p 5000:5000 -v ${PWD}/data:/data osrm/osrm-backend osrm-routed /data/maryland-latest.osrm")
        sys.exit(1)

    print(f"{args.engine} connection OK")

    # Extract route signatures for all addresses
    print(f"\nCalculating routes for {len(addresses)} addresses...")
    signatures = []
    coords = []

    for i, feature in enumerate(addresses):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})

        if geom.get("type") != "Point":
            continue

        coord = geom.get("coordinates", [])
        if len(coord) < 2:
            continue

        street_addr = props.get("address", props.get("FULL_ADDRESS", props.get("full_address", f"Address {i}")))
        city = props.get("city", "")
        address = f"{street_addr}, {city}" if city else street_addr
        address_id = props.get("id", str(i))
        location = (coord[0], coord[1])

        sig = extract_route_signature(
            address_id=address_id,
            address=address,
            location=location,
            station_loc=station_loc,
            routing_url=args.routing_url,
            routing_engine=args.engine
        )

        signatures.append(sig)
        coords.append([coord[0], coord[1]])

        # Progress indicator
        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{len(addresses)} addresses...")

    print(f"Successfully routed to {len([s for s in signatures if s.success])}/{len(signatures)} addresses")

    # Convert coords to numpy array
    coords_array = np.array(coords)

    # Find instabilities
    print(f"\nAnalyzing for routing instabilities...")
    instabilities = find_instabilities(
        signatures=signatures,
        addresses_coords=coords_array,
        bearing_threshold=args.bearing_threshold,
        overlap_threshold=args.overlap_threshold,
        max_neighbor_distance=args.max_neighbor_distance
    )

    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2}
    instabilities.sort(key=lambda x: (severity_order[x.severity], -x.bearing_difference))

    # Print summary
    print(f"\n{'='*60}")
    print(f"RESULTS: Found {len(instabilities)} routing instability zones")
    print(f"{'='*60}")

    critical = [z for z in instabilities if z.severity == "critical"]
    high = [z for z in instabilities if z.severity == "high"]
    medium = [z for z in instabilities if z.severity == "medium"]

    print(f"  CRITICAL (opposite directions): {len(critical)}")
    print(f"  HIGH (major route difference):  {len(high)}")
    print(f"  MEDIUM (significant difference): {len(medium)}")

    # Print top instabilities
    if instabilities:
        print(f"\n{'='*60}")
        print("TOP INSTABILITY ZONES:")
        print(f"{'='*60}")

        for zone in instabilities[:15]:
            print(f"\n[{zone.severity.upper()}] {zone.distance_apart:.0f}m apart - {zone.reason}")
            print(f"  Address 1: {zone.address1.address}")
            uturn1 = " [HAS U-TURN]" if zone.address1.has_uturn else ""
            print(f"    Route ({zone.address1.total_distance:.0f}m){uturn1}: {' > '.join(zone.address1.route_roads[:4])}")
            print(f"  Address 2: {zone.address2.address}")
            uturn2 = " [HAS U-TURN]" if zone.address2.has_uturn else ""
            print(f"    Route ({zone.address2.total_distance:.0f}m){uturn2}: {' > '.join(zone.address2.route_roads[:4])}")

    # Export results
    output_file = args.output or GIS_DIR / f"routing_instabilities_{station_pattern}.geojson"
    export_results(instabilities, Path(output_file), station_pattern)

    print(f"\nDone! Visualize results by loading {output_file} on the map.")


if __name__ == "__main__":
    main()
