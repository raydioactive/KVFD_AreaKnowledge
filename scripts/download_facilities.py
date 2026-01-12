#!/usr/bin/env python3
"""
Download hospital and nursing home data from official sources.

Sources:
- HIFLD (Homeland Infrastructure Foundation-Level Data) for hospitals
- CMS (Centers for Medicare & Medicaid Services) for nursing homes
- DC Open Data for DC-specific facilities

Usage:
    python scripts/download_facilities.py
    python scripts/download_facilities.py --include-dc
"""

import argparse
import json
import sys
from pathlib import Path
import requests

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data" / "gis"

# HIFLD Hospital endpoint
HIFLD_HOSPITALS_URL = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Hospitals_1/FeatureServer/0/query"

# CMS Nursing Homes
CMS_NURSING_HOMES_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py"

# DC Open Data
DC_HOSPITALS_URL = "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Health_WebMercator/MapServer/6/query"

# States to include
STATES = ["MD", "DC"]

# Montgomery County bounding box (approximate, extended for nearby hospitals)
MOCO_BOUNDS = {
    "min_lat": 38.85,
    "max_lat": 39.40,
    "min_lng": -77.55,
    "max_lng": -76.85
}


def download_hifld_hospitals():
    """Download hospitals from HIFLD."""
    print("Downloading hospitals from HIFLD...")

    all_features = []

    for state in STATES:
        params = {
            "where": f"STATE='{state}'",
            "outFields": "*",
            "f": "geojson",
            "resultRecordCount": 1000
        }

        try:
            response = requests.get(HIFLD_HOSPITALS_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            features = data.get("features", [])
            print(f"  Found {len(features)} hospitals in {state}")
            all_features.extend(features)

        except Exception as e:
            print(f"  Error fetching {state} hospitals: {e}")

    return all_features


def download_dc_hospitals():
    """Download DC hospitals from DC Open Data."""
    print("Downloading DC hospitals from DC Open Data...")

    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson"
    }

    try:
        response = requests.get(DC_HOSPITALS_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        features = data.get("features", [])
        print(f"  Found {len(features)} DC facilities")
        return features

    except Exception as e:
        print(f"  Error fetching DC hospitals: {e}")
        return []


def download_cms_nursing_homes():
    """Download nursing homes from CMS."""
    print("Downloading nursing homes from CMS...")

    all_records = []

    for state in STATES:
        try:
            # CMS API
            params = {
                "limit": 500,
                "offset": 0,
            }

            url = f"https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py?filter[state]={state}&limit=500"
            response = requests.get(url, timeout=30)

            if response.status_code == 200:
                data = response.json()
                records = data.get("results", [])
                print(f"  Found {len(records)} nursing homes in {state}")
                all_records.extend(records)
            else:
                print(f"  CMS API returned {response.status_code} for {state}")

        except Exception as e:
            print(f"  Error fetching {state} nursing homes: {e}")

    return all_records


def normalize_hospital(feature, source="hifld"):
    """Normalize hospital data to common format."""
    props = feature.get("properties", {})
    geom = feature.get("geometry", {})

    # Get coordinates
    coords = None
    if geom.get("type") == "Point":
        coords = geom.get("coordinates")
    elif "LONGITUDE" in props and "LATITUDE" in props:
        coords = [float(props["LONGITUDE"]), float(props["LATITUDE"])]

    if not coords:
        return None

    # Determine trauma level
    trauma = props.get("TRAUMA", "")
    trauma_level = None
    if trauma:
        if "LEVEL I" in trauma.upper() or "LEVEL 1" in trauma.upper():
            trauma_level = 1
        elif "LEVEL II" in trauma.upper() or "LEVEL 2" in trauma.upper():
            trauma_level = 2
        elif "LEVEL III" in trauma.upper() or "LEVEL 3" in trauma.upper():
            trauma_level = 3

    # Determine hospital type
    hosp_type = props.get("TYPE", "GENERAL ACUTE CARE")

    # Check for specialty designations
    helipad = props.get("HELIPAD", "N") == "Y"

    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": coords
        },
        "properties": {
            "name": props.get("NAME", "Unknown Hospital"),
            "address": props.get("ADDRESS", ""),
            "city": props.get("CITY", ""),
            "state": props.get("STATE", ""),
            "zip": props.get("ZIP", ""),
            "phone": props.get("TELEPHONE", ""),
            "type": hosp_type,
            "trauma_level": trauma_level,
            "helipad": helipad,
            "beds": props.get("BEDS", 0),
            "owner": props.get("OWNER", ""),
            "status": props.get("STATUS", "OPEN"),
            "source": source,
            # EMS-specific fields
            "is_trauma_center": trauma_level is not None,
            "is_stemi_center": False,  # Will need separate data source
            "is_stroke_center": False,  # Will need separate data source
            "is_burn_center": False,
            "is_pediatric": "CHILDREN" in hosp_type.upper() if hosp_type else False,
        }
    }


def normalize_nursing_home(record):
    """Normalize CMS nursing home data."""
    try:
        lat = float(record.get("latitude", 0))
        lng = float(record.get("longitude", 0))

        if lat == 0 or lng == 0:
            return None

        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lng, lat]
            },
            "properties": {
                "name": record.get("provider_name", "Unknown"),
                "address": record.get("provider_address", ""),
                "city": record.get("provider_city", ""),
                "state": record.get("provider_state", ""),
                "zip": record.get("provider_zip_code", ""),
                "phone": record.get("provider_phone_number", ""),
                "beds": int(record.get("number_of_certified_beds", 0) or 0),
                "rating": record.get("overall_rating", ""),
                "ownership": record.get("ownership_type", ""),
                "source": "cms"
            }
        }
    except (ValueError, TypeError):
        return None


def filter_by_bounds(features, bounds):
    """Filter features to those within bounding box."""
    filtered = []
    for f in features:
        coords = f.get("geometry", {}).get("coordinates", [])
        if len(coords) >= 2:
            lng, lat = coords[0], coords[1]
            if (bounds["min_lat"] <= lat <= bounds["max_lat"] and
                bounds["min_lng"] <= lng <= bounds["max_lng"]):
                filtered.append(f)
    return filtered


def add_maryland_specialty_centers(hospitals):
    """Add Maryland specialty center designations based on known data."""
    # Known trauma centers from Maryland TraumaNET
    TRAUMA_CENTERS = {
        "R ADAMS COWLEY SHOCK TRAUMA CENTER": {"trauma_level": 1, "is_trauma_center": True},
        "JOHNS HOPKINS HOSPITAL": {"trauma_level": 1, "is_trauma_center": True},
        "UNIVERSITY OF MARYLAND MEDICAL CENTER": {"trauma_level": 1, "is_trauma_center": True},
        "SUBURBAN HOSPITAL": {"trauma_level": 2, "is_trauma_center": True},
        "MEDSTAR WASHINGTON HOSPITAL CENTER": {"trauma_level": 1, "is_trauma_center": True},
        "CHILDREN'S NATIONAL MEDICAL CENTER": {"trauma_level": 1, "is_trauma_center": True, "is_pediatric": True},
        "PRINCE GEORGE'S HOSPITAL CENTER": {"trauma_level": 2, "is_trauma_center": True},
        "HOLY CROSS HOSPITAL": {"trauma_level": 2, "is_trauma_center": True},
    }

    # Known STEMI centers
    STEMI_CENTERS = [
        "SUBURBAN HOSPITAL",
        "HOLY CROSS HOSPITAL",
        "ADVENTIST HEALTHCARE SHADY GROVE",
        "MEDSTAR MONTGOMERY",
        "ADVENTIST HEALTHCARE WHITE OAK",
        "JOHNS HOPKINS HOSPITAL",
        "MEDSTAR WASHINGTON HOSPITAL CENTER",
        "GEORGE WASHINGTON UNIVERSITY HOSPITAL",
        "HOWARD UNIVERSITY HOSPITAL",
    ]

    # Known stroke centers
    STROKE_CENTERS = [
        "SUBURBAN HOSPITAL",
        "HOLY CROSS HOSPITAL",
        "ADVENTIST HEALTHCARE SHADY GROVE",
        "MEDSTAR MONTGOMERY",
        "ADVENTIST HEALTHCARE WHITE OAK",
        "JOHNS HOPKINS HOSPITAL",
        "MEDSTAR WASHINGTON HOSPITAL CENTER",
        "GEORGE WASHINGTON UNIVERSITY HOSPITAL",
    ]

    for hospital in hospitals:
        name = hospital["properties"]["name"].upper()

        # Check trauma centers
        for center_name, attrs in TRAUMA_CENTERS.items():
            if center_name in name:
                hospital["properties"].update(attrs)
                break

        # Check STEMI centers
        for center in STEMI_CENTERS:
            if center in name:
                hospital["properties"]["is_stemi_center"] = True
                break

        # Check stroke centers
        for center in STROKE_CENTERS:
            if center in name:
                hospital["properties"]["is_stroke_center"] = True
                break

    return hospitals


def main():
    parser = argparse.ArgumentParser(description="Download hospital and nursing home data")
    parser.add_argument("--include-dc", action="store_true", help="Include DC facilities")
    parser.add_argument("--filter-bounds", action="store_true", default=True,
                        help="Filter to Montgomery County area")

    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Downloading facility data...")
    print("=" * 60)

    # Download hospitals
    hifld_hospitals = download_hifld_hospitals()

    # Normalize hospitals
    hospitals = []
    for h in hifld_hospitals:
        normalized = normalize_hospital(h, "hifld")
        if normalized:
            hospitals.append(normalized)

    print(f"\nTotal hospitals before filtering: {len(hospitals)}")

    # Filter to area of interest
    if args.filter_bounds:
        hospitals = filter_by_bounds(hospitals, MOCO_BOUNDS)
        print(f"Hospitals after filtering to MoCo area: {len(hospitals)}")

    # Add specialty designations
    hospitals = add_maryland_specialty_centers(hospitals)

    # Count specialties
    trauma_count = sum(1 for h in hospitals if h["properties"].get("is_trauma_center"))
    stemi_count = sum(1 for h in hospitals if h["properties"].get("is_stemi_center"))
    stroke_count = sum(1 for h in hospitals if h["properties"].get("is_stroke_center"))

    print(f"  Trauma centers: {trauma_count}")
    print(f"  STEMI centers: {stemi_count}")
    print(f"  Stroke centers: {stroke_count}")

    # Save hospitals
    hospitals_geojson = {
        "type": "FeatureCollection",
        "features": hospitals
    }

    hospitals_file = DATA_DIR / "hospitals.geojson"
    with open(hospitals_file, "w") as f:
        json.dump(hospitals_geojson, f, indent=2)
    print(f"\nSaved {len(hospitals)} hospitals to {hospitals_file}")

    # Download nursing homes
    print()
    cms_nursing_homes = download_cms_nursing_homes()

    nursing_homes = []
    for nh in cms_nursing_homes:
        normalized = normalize_nursing_home(nh)
        if normalized:
            nursing_homes.append(normalized)

    print(f"\nTotal nursing homes before filtering: {len(nursing_homes)}")

    if args.filter_bounds:
        nursing_homes = filter_by_bounds(nursing_homes, MOCO_BOUNDS)
        print(f"Nursing homes after filtering: {len(nursing_homes)}")

    # Save nursing homes
    nursing_homes_geojson = {
        "type": "FeatureCollection",
        "features": nursing_homes
    }

    nursing_homes_file = DATA_DIR / "nursing_homes.geojson"
    with open(nursing_homes_file, "w") as f:
        json.dump(nursing_homes_geojson, f, indent=2)
    print(f"Saved {len(nursing_homes)} nursing homes to {nursing_homes_file}")

    # Print sample
    print("\n" + "=" * 60)
    print("Sample hospitals:")
    print("=" * 60)
    for h in hospitals[:5]:
        props = h["properties"]
        specialties = []
        if props.get("is_trauma_center"):
            specialties.append(f"Trauma L{props.get('trauma_level')}")
        if props.get("is_stemi_center"):
            specialties.append("STEMI")
        if props.get("is_stroke_center"):
            specialties.append("Stroke")
        spec_str = f" [{', '.join(specialties)}]" if specialties else ""
        print(f"  {props['name']}{spec_str}")
        print(f"    {props['address']}, {props['city']}, {props['state']}")

    print("\n" + "=" * 60)
    print("Sample nursing homes:")
    print("=" * 60)
    for nh in nursing_homes[:5]:
        props = nh["properties"]
        print(f"  {props['name']}")
        print(f"    {props['address']}, {props['city']}")

    print("\nDone!")


if __name__ == "__main__":
    main()
