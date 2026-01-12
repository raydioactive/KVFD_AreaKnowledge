#!/usr/bin/env python3
"""
Geocode facility addresses to get accurate coordinates.
Uses Nominatim (OpenStreetMap) for geocoding.
"""

import json
import time
from pathlib import Path
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "gis"

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

def geocode_address(address: str, city: str, state: str, zip_code: str) -> tuple[float, float] | None:
    """Geocode an address using Nominatim."""
    full_address = f"{address}, {city}, {state} {zip_code}"

    params = {
        "q": full_address,
        "format": "json",
        "limit": 1,
        "countrycodes": "us"
    }

    headers = {
        "User-Agent": "KVFD_Quiz_Geocoder/1.0"
    }

    try:
        response = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        response.raise_for_status()

        results = response.json()
        if results:
            lat = float(results[0]["lat"])
            lon = float(results[0]["lon"])
            return (lon, lat)  # GeoJSON uses [lng, lat]
        else:
            print(f"  No results for: {full_address}")
            return None

    except Exception as e:
        print(f"  Error geocoding {full_address}: {e}")
        return None


def geocode_geojson(input_file: Path, output_file: Path):
    """Geocode all features in a GeoJSON file."""
    print(f"\nProcessing {input_file.name}...")

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    features = data.get("features", [])
    updated = 0

    for i, feature in enumerate(features):
        props = feature.get("properties", {})
        name = props.get("name", "Unknown")
        address = props.get("address", "")
        city = props.get("city", "")
        state = props.get("state", "MD")
        zip_code = props.get("zip_code", "")

        if not address:
            print(f"  Skipping {name}: no address")
            continue

        print(f"  [{i+1}/{len(features)}] Geocoding: {name}")

        coords = geocode_address(address, city, state, zip_code)

        if coords:
            old_coords = feature.get("geometry", {}).get("coordinates", [])
            feature["geometry"]["coordinates"] = list(coords)
            print(f"    {old_coords} -> {list(coords)}")
            updated += 1

        # Rate limit: Nominatim requires 1 request per second
        time.sleep(1.1)

    # Save updated file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"\nUpdated {updated}/{len(features)} coordinates")
    print(f"Saved to {output_file}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Geocode facility addresses")
    parser.add_argument("--hospitals", action="store_true", help="Geocode hospitals")
    parser.add_argument("--nursing-homes", action="store_true", help="Geocode nursing homes")
    parser.add_argument("--all", action="store_true", help="Geocode all facilities")

    args = parser.parse_args()

    if args.all or args.hospitals:
        geocode_geojson(
            DATA_DIR / "hospitals.geojson",
            DATA_DIR / "hospitals.geojson"
        )

    if args.all or args.nursing_homes:
        geocode_geojson(
            DATA_DIR / "nursing_homes.geojson",
            DATA_DIR / "nursing_homes.geojson"
        )


if __name__ == "__main__":
    main()
