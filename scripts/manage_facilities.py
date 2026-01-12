#!/usr/bin/env python3
"""
Montgomery County Facility Data Manager
Manages fire stations, hospitals, and nursing homes data.

Commands:
  download-stations  Download official fire station data from MoCo GIS
  geocode           Geocode addresses to coordinates using Nominatim
  generate          Generate GeoJSON files from facilities.csv
  validate          Validate coordinates are within Montgomery County
  export            Export existing GeoJSON to CSV format
"""
import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional, Dict, List, Tuple

try:
    import requests
except ImportError:
    print("Error: requests library required. Install with: pip install requests")
    sys.exit(1)


# Montgomery County bounds (approximate)
MOCO_BOUNDS = {
    'min_lat': 38.85,
    'max_lat': 39.35,
    'min_lng': -77.55,
    'max_lng': -76.85
}

# MoCo GIS endpoints
FIRE_STATIONS_URL = "https://gis3.montgomerycountymd.gov/arcgis/rest/services/GDX/fire_station_pts/FeatureServer/0/query"
HOSPITALS_URL = "https://gis3.montgomerycountymd.gov/arcgis/rest/services/GDX/hospital_pts/FeatureServer/0/query"

# Nominatim (OpenStreetMap) geocoding endpoint
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def get_data_dir() -> Path:
    """Get the GIS data directory."""
    data_dir = get_project_root() / "data" / "gis"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def load_csv() -> List[Dict]:
    """Load facilities from CSV file."""
    csv_path = get_data_dir() / "facilities.csv"
    if not csv_path.exists():
        print(f"Error: {csv_path} not found. Run 'export' first to create it.")
        return []

    facilities = []
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            if row.get('lng'):
                row['lng'] = float(row['lng'])
            if row.get('lat'):
                row['lat'] = float(row['lat'])
            if row.get('bed_count'):
                row['bed_count'] = int(row['bed_count']) if row['bed_count'] else None
            if row.get('cms_rating'):
                row['cms_rating'] = int(row['cms_rating']) if row['cms_rating'] else None
            row['verified'] = row.get('verified', '').lower() == 'true'
            facilities.append(row)

    return facilities


def save_csv(facilities: List[Dict]) -> None:
    """Save facilities to CSV file."""
    csv_path = get_data_dir() / "facilities.csv"

    # Determine fieldnames from first few records
    fieldnames = ['type', 'id', 'name', 'short_name', 'address', 'city', 'state', 'zip',
                  'lng', 'lat', 'verified', 'station_type', 'station_number',
                  'is_trauma_center', 'trauma_level', 'is_stemi_center', 'is_stroke_center',
                  'stroke_level', 'is_burn_center', 'is_pediatric_center', 'has_helipad',
                  'facility_type', 'bed_count', 'cms_rating', 'apparatus']

    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for facility in facilities:
            writer.writerow(facility)

    print(f"Saved {len(facilities)} facilities to {csv_path}")


def clean_address(address: str) -> str:
    """Clean address by removing building numbers, suite info, etc."""
    import re

    # Remove building info (Bldg, Building, Bld)
    address = re.sub(r',?\s*Bldg\.?\s*\d+\w*', '', address, flags=re.IGNORECASE)
    address = re.sub(r',?\s*Building\s*\d+\w*', '', address, flags=re.IGNORECASE)

    # Remove suite info
    address = re.sub(r',?\s*Suite\s*\d+\w*', '', address, flags=re.IGNORECASE)
    address = re.sub(r',?\s*Ste\.?\s*\d+\w*', '', address, flags=re.IGNORECASE)

    # Remove room/floor info
    address = re.sub(r',?\s*Room\s*\d+\w*', '', address, flags=re.IGNORECASE)
    address = re.sub(r',?\s*Floor\s*\d+\w*', '', address, flags=re.IGNORECASE)

    # Remove unit info
    address = re.sub(r',?\s*Unit\s*\d+\w*', '', address, flags=re.IGNORECASE)

    # Clean up extra spaces and commas
    address = re.sub(r'\s+', ' ', address).strip()
    address = re.sub(r',\s*,', ',', address)
    address = address.rstrip(',').strip()

    return address


def geocode_address(address: str, city: str, state: str, zip_code: str) -> Optional[Tuple[float, float]]:
    """
    Geocode an address using Nominatim (OpenStreetMap).
    Returns (longitude, latitude) or None if not found.
    """
    # Try with original address first
    addresses_to_try = [address]

    # Add cleaned version if different
    cleaned = clean_address(address)
    if cleaned != address:
        addresses_to_try.append(cleaned)

    # Also try with just street number and name (simpler)
    import re
    simple_match = re.match(r'^(\d+\s+\w+(?:\s+\w+)?(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pike|Pkwy|Parkway))?)', address, re.IGNORECASE)
    if simple_match:
        simple_addr = simple_match.group(1)
        if simple_addr not in addresses_to_try:
            addresses_to_try.append(simple_addr)

    headers = {
        'User-Agent': 'KVFD_Quiz/1.0 (Montgomery County EMS Training App)'
    }

    for addr in addresses_to_try:
        full_address = f"{addr}, {city}, {state} {zip_code}"

        try:
            params = {
                'q': full_address,
                'format': 'json',
                'limit': 1,
                'countrycodes': 'us'
            }

            response = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
            response.raise_for_status()

            results = response.json()
            if results:
                return (float(results[0]['lon']), float(results[0]['lat']))

            # Small delay between retries
            time.sleep(0.5)

        except Exception as e:
            print(f"  Geocoding error for '{full_address}': {e}")

    return None


def is_in_moco(lat: float, lng: float) -> bool:
    """Check if coordinates are within Montgomery County bounds."""
    return (MOCO_BOUNDS['min_lat'] <= lat <= MOCO_BOUNDS['max_lat'] and
            MOCO_BOUNDS['min_lng'] <= lng <= MOCO_BOUNDS['max_lng'])


# =============================================================================
# COMMAND: download-stations
# =============================================================================
def cmd_download_stations(args) -> int:
    """Download official fire station data from Montgomery County GIS."""
    print("\n" + "="*60)
    print("DOWNLOADING OFFICIAL FIRE STATION DATA")
    print("="*60)
    print(f"\nSource: {FIRE_STATIONS_URL}")

    try:
        params = {
            'where': '1=1',
            'outFields': '*',
            'outSR': '4326',
            'f': 'geojson'
        }

        print("Fetching fire station data from MoCo GIS...")
        response = requests.get(FIRE_STATIONS_URL, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        features = data.get('features', [])

        if not features:
            print("\nNo features found. The endpoint may have changed.")
            print("Try checking: https://opendata-mcgov-gis.hub.arcgis.com/")
            return 1

        print(f"\nDownloaded {len(features)} fire stations")

        # Show sample data
        if features:
            sample = features[0]
            print("\nSample station properties:")
            for key, value in list(sample.get('properties', {}).items())[:8]:
                print(f"  {key}: {value}")

            coords = sample.get('geometry', {}).get('coordinates', [])
            print(f"  coordinates: [{coords[0]:.4f}, {coords[1]:.4f}]")

        # Save raw GeoJSON
        output_path = get_data_dir() / "fire_stations_official.geojson"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        print(f"\nSaved to: {output_path}")
        print("\nNow run 'export' to merge with facilities.csv")
        return 0

    except requests.exceptions.RequestException as e:
        print(f"\nDownload failed: {e}")
        print("\nAlternative: Visit https://opendata-mcgov-gis.hub.arcgis.com/")
        print("Search for 'fire stations' and download manually.")
        return 1


# =============================================================================
# COMMAND: download-hospitals
# =============================================================================
def cmd_download_hospitals(args) -> int:
    """Download official hospital data from Montgomery County GIS."""
    print("\n" + "="*60)
    print("DOWNLOADING OFFICIAL HOSPITAL DATA")
    print("="*60)
    print(f"\nSource: {HOSPITALS_URL}")

    try:
        params = {
            'where': '1=1',
            'outFields': '*',
            'outSR': '4326',
            'f': 'geojson'
        }

        print("Fetching hospital data from MoCo GIS...")
        response = requests.get(HOSPITALS_URL, params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        features = data.get('features', [])

        if not features:
            print("\nNo features found.")
            return 1

        print(f"\nDownloaded {len(features)} hospitals")

        if features:
            sample = features[0]
            print("\nSample hospital properties:")
            for key, value in list(sample.get('properties', {}).items())[:8]:
                print(f"  {key}: {value}")

        output_path = get_data_dir() / "hospitals_official.geojson"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        print(f"\nSaved to: {output_path}")
        return 0

    except requests.exceptions.RequestException as e:
        print(f"\nDownload failed: {e}")
        return 1


# =============================================================================
# COMMAND: merge-official
# =============================================================================
def cmd_merge_official(args) -> int:
    """Merge official GIS data into facilities.csv with accurate coordinates."""
    print("\n" + "="*60)
    print("MERGING OFFICIAL GIS DATA")
    print("="*60)

    data_dir = get_data_dir()
    facilities = load_csv()

    if not facilities:
        print("Error: facilities.csv not found. Run 'export' first.")
        return 1

    updated_stations = 0
    updated_hospitals = 0

    # Merge official fire stations
    stations_path = data_dir / "fire_stations_official.geojson"
    if stations_path.exists():
        print("\nMerging official fire station coordinates...")
        with open(stations_path, 'r', encoding='utf-8') as f:
            official = json.load(f)

        for feature in official.get('features', []):
            props = feature.get('properties', {})
            coords = feature.get('geometry', {}).get('coordinates', [])

            if not coords:
                continue

            name = props.get('NAME', '')
            address = props.get('ADDRESS', '')

            # Try to match by station number or address
            station_num = None
            if 'Station' in name:
                import re
                match = re.search(r'Station\s*(\d+)', name)
                if match:
                    station_num = match.group(1)

            for facility in facilities:
                if facility.get('type') != 'station':
                    continue

                matched = False

                # Match by station number
                if station_num and facility.get('station_number') == station_num:
                    matched = True
                # Match by address (fuzzy)
                elif address and facility.get('address') and address.lower().split()[0] in facility.get('address', '').lower():
                    matched = True

                if matched:
                    facility['lng'] = coords[0]
                    facility['lat'] = coords[1]
                    facility['verified'] = 'true'
                    # Update address/city from official data
                    if address:
                        facility['address'] = address
                    if props.get('CITY'):
                        facility['city'] = props['CITY']
                    if props.get('ZIPCODE'):
                        facility['zip'] = props['ZIPCODE']
                    updated_stations += 1
                    print(f"  Updated: Station {station_num or facility.get('station_number')} - [{coords[0]:.4f}, {coords[1]:.4f}]")
                    break

        print(f"\n  Updated {updated_stations} fire stations from official data")
    else:
        print("\nNo official fire station data found. Run 'download-stations' first.")

    # Merge official hospitals
    hospitals_path = data_dir / "hospitals_official.geojson"
    if hospitals_path.exists():
        print("\nMerging official hospital coordinates...")
        with open(hospitals_path, 'r', encoding='utf-8') as f:
            official = json.load(f)

        for feature in official.get('features', []):
            props = feature.get('properties', {})
            coords = feature.get('geometry', {}).get('coordinates', [])

            if not coords:
                continue

            name = props.get('NAME', '').lower()
            address = props.get('ADDRESS', '')

            for facility in facilities:
                if facility.get('type') != 'hospital':
                    continue

                facility_name = facility.get('name', '').lower()

                # Match by name (partial)
                matched = False
                if name and facility_name:
                    # Check if key words match
                    for keyword in ['suburban', 'holy cross', 'shady grove', 'adventist', 'medstar', 'nih', 'walter reed']:
                        if keyword in name and keyword in facility_name:
                            matched = True
                            break

                if matched:
                    facility['lng'] = coords[0]
                    facility['lat'] = coords[1]
                    facility['verified'] = 'true'
                    if address:
                        facility['address'] = address
                    if props.get('CITY'):
                        facility['city'] = props['CITY']
                    if props.get('ZIPCODE'):
                        facility['zip'] = props['ZIPCODE']
                    updated_hospitals += 1
                    print(f"  Updated: {facility.get('name')} - [{coords[0]:.4f}, {coords[1]:.4f}]")
                    break

        print(f"\n  Updated {updated_hospitals} hospitals from official data")
    else:
        print("\nNo official hospital data found. Run 'download-hospitals' first.")

    # Save updated CSV
    save_csv(facilities)

    print(f"\n" + "="*60)
    print(f"MERGE COMPLETE")
    print(f"  Fire stations updated: {updated_stations}")
    print(f"  Hospitals updated: {updated_hospitals}")
    print(f"="*60)

    return 0


# =============================================================================
# COMMAND: geocode
# =============================================================================
def cmd_geocode(args) -> int:
    """Geocode facilities missing coordinates."""
    print("\n" + "="*60)
    print("GEOCODING FACILITY ADDRESSES")
    print("="*60)

    facilities = load_csv()
    if not facilities:
        return 1

    # Find facilities needing geocoding
    to_geocode = []
    for f in facilities:
        if not f.get('lng') or not f.get('lat') or args.force:
            to_geocode.append(f)

    if not to_geocode:
        print("\nAll facilities already have coordinates.")
        print("Use --force to re-geocode all addresses.")
        return 0

    print(f"\nGeocoding {len(to_geocode)} facilities...")
    print("(Rate limited to 1 request/second for Nominatim)")

    geocoded = 0
    failed = 0

    for i, facility in enumerate(to_geocode):
        address = facility.get('address', '')
        city = facility.get('city', '')
        state = facility.get('state', 'MD')
        zip_code = facility.get('zip', '')

        print(f"\n[{i+1}/{len(to_geocode)}] {facility.get('name', 'Unknown')}")
        print(f"  Address: {address}, {city}, {state} {zip_code}")

        coords = geocode_address(address, city, state, zip_code)

        if coords:
            lng, lat = coords
            facility['lng'] = lng
            facility['lat'] = lat
            facility['verified'] = False
            print(f"  Found: [{lng:.6f}, {lat:.6f}]")

            if not is_in_moco(lat, lng):
                print(f"  WARNING: Outside Montgomery County bounds!")

            geocoded += 1
        else:
            print(f"  FAILED: Could not geocode address")
            failed += 1

        # Rate limiting for Nominatim
        if i < len(to_geocode) - 1:
            time.sleep(1.1)

    # Save updated data
    save_csv(facilities)

    print(f"\n" + "="*60)
    print(f"GEOCODING COMPLETE")
    print(f"  Successful: {geocoded}")
    print(f"  Failed: {failed}")
    print(f"="*60)

    return 0 if failed == 0 else 1


# =============================================================================
# COMMAND: generate
# =============================================================================
def cmd_generate(args) -> int:
    """Generate GeoJSON files from facilities.csv."""
    print("\n" + "="*60)
    print("GENERATING GEOJSON FILES")
    print("="*60)

    facilities = load_csv()
    if not facilities:
        return 1

    data_dir = get_data_dir()

    # Separate by type
    hospitals = [f for f in facilities if f.get('type') == 'hospital']
    stations = [f for f in facilities if f.get('type') == 'station']
    nursing_homes = [f for f in facilities if f.get('type') == 'nursing']

    print(f"\nFacilities: {len(hospitals)} hospitals, {len(stations)} stations, {len(nursing_homes)} nursing homes")

    # Generate hospitals.geojson
    if hospitals:
        hospital_features = []
        for h in hospitals:
            if not h.get('lng') or not h.get('lat'):
                print(f"  Skipping {h.get('name')} - missing coordinates")
                continue

            feature = {
                "type": "Feature",
                "properties": {
                    "id": int(h.get('id', 0)),
                    "name": h.get('name', ''),
                    "short_name": h.get('short_name', ''),
                    "address": h.get('address', ''),
                    "city": h.get('city', ''),
                    "state": h.get('state', 'MD'),
                    "zip_code": h.get('zip', ''),
                    "is_trauma_center": h.get('is_trauma_center', '').lower() == 'true',
                    "trauma_level": h.get('trauma_level') or None,
                    "is_stemi_center": h.get('is_stemi_center', '').lower() == 'true',
                    "is_stroke_center": h.get('is_stroke_center', '').lower() == 'true',
                    "stroke_level": h.get('stroke_level') or None,
                    "is_burn_center": h.get('is_burn_center', '').lower() == 'true',
                    "is_pediatric_center": h.get('is_pediatric_center', '').lower() == 'true',
                    "has_helipad": h.get('has_helipad', '').lower() == 'true',
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [h['lng'], h['lat']]
                }
            }
            hospital_features.append(feature)

        hospital_geojson = {
            "type": "FeatureCollection",
            "name": "Montgomery County Hospitals",
            "features": hospital_features
        }

        with open(data_dir / "hospitals.geojson", 'w', encoding='utf-8') as f:
            json.dump(hospital_geojson, f, indent=2)
        print(f"  Generated hospitals.geojson ({len(hospital_features)} features)")

    # Generate fire_stations.geojson
    if stations:
        station_features = []
        for s in stations:
            if not s.get('lng') or not s.get('lat'):
                print(f"  Skipping Station {s.get('station_number')} - missing coordinates")
                continue

            # Parse apparatus list
            apparatus = []
            if s.get('apparatus'):
                apparatus = [a.strip() for a in s['apparatus'].split('|')]

            # Handle non-numeric IDs
            station_id = s.get('id', 0)
            try:
                station_id = int(station_id)
            except (ValueError, TypeError):
                station_id = hash(str(station_id)) % 10000  # Generate a numeric ID

            feature = {
                "type": "Feature",
                "properties": {
                    "id": station_id,
                    "station_number": s.get('station_number', ''),
                    "station_name": s.get('name', ''),
                    "address": s.get('address', ''),
                    "city": s.get('city', ''),
                    "zip_code": s.get('zip', ''),
                    "station_type": s.get('station_type', 'career'),
                    "apparatus": apparatus
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [s['lng'], s['lat']]
                }
            }
            station_features.append(feature)

        station_geojson = {
            "type": "FeatureCollection",
            "name": "Montgomery County Fire Stations",
            "features": station_features
        }

        with open(data_dir / "fire_stations.geojson", 'w', encoding='utf-8') as f:
            json.dump(station_geojson, f, indent=2)
        print(f"  Generated fire_stations.geojson ({len(station_features)} features)")

    # Generate nursing_homes.geojson
    if nursing_homes:
        nursing_features = []
        for n in nursing_homes:
            if not n.get('lng') or not n.get('lat'):
                print(f"  Skipping {n.get('name')} - missing coordinates")
                continue

            feature = {
                "type": "Feature",
                "properties": {
                    "id": int(n.get('id', 0)),
                    "name": n.get('name', ''),
                    "short_name": n.get('short_name', ''),
                    "address": n.get('address', ''),
                    "city": n.get('city', ''),
                    "state": n.get('state', 'MD'),
                    "zip_code": n.get('zip', ''),
                    "facility_type": n.get('facility_type', 'nursing_home'),
                    "bed_count": n.get('bed_count'),
                    "cms_rating": n.get('cms_rating')
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [n['lng'], n['lat']]
                }
            }
            nursing_features.append(feature)

        nursing_geojson = {
            "type": "FeatureCollection",
            "name": "Montgomery County Nursing Homes",
            "features": nursing_features
        }

        with open(data_dir / "nursing_homes.geojson", 'w', encoding='utf-8') as f:
            json.dump(nursing_geojson, f, indent=2)
        print(f"  Generated nursing_homes.geojson ({len(nursing_features)} features)")

    print("\nGeoJSON generation complete!")
    return 0


# =============================================================================
# COMMAND: validate
# =============================================================================
def cmd_validate(args) -> int:
    """Validate all coordinates are within Montgomery County."""
    print("\n" + "="*60)
    print("VALIDATING FACILITY COORDINATES")
    print("="*60)

    facilities = load_csv()
    if not facilities:
        return 1

    print(f"\nValidating {len(facilities)} facilities...")
    print(f"Montgomery County bounds:")
    print(f"  Latitude:  {MOCO_BOUNDS['min_lat']:.2f} to {MOCO_BOUNDS['max_lat']:.2f}")
    print(f"  Longitude: {MOCO_BOUNDS['min_lng']:.2f} to {MOCO_BOUNDS['max_lng']:.2f}")

    valid = 0
    invalid = 0
    missing = 0

    for f in facilities:
        name = f.get('name') or f.get('station_number') or 'Unknown'

        if not f.get('lng') or not f.get('lat'):
            print(f"\n  MISSING: {name} - no coordinates")
            missing += 1
            continue

        lat = float(f['lat'])
        lng = float(f['lng'])

        if is_in_moco(lat, lng):
            valid += 1
        else:
            print(f"\n  INVALID: {name}")
            print(f"    Coordinates: [{lng:.4f}, {lat:.4f}]")
            print(f"    Address: {f.get('address')}, {f.get('city')}")
            invalid += 1

    print(f"\n" + "="*60)
    print(f"VALIDATION RESULTS")
    print(f"  Valid: {valid}")
    print(f"  Invalid (outside bounds): {invalid}")
    print(f"  Missing coordinates: {missing}")
    print(f"="*60)

    return 0 if invalid == 0 and missing == 0 else 1


# =============================================================================
# COMMAND: export
# =============================================================================
def cmd_export(args) -> int:
    """Export existing GeoJSON files to facilities.csv."""
    print("\n" + "="*60)
    print("EXPORTING GEOJSON TO CSV")
    print("="*60)

    data_dir = get_data_dir()
    facilities = []

    # Load hospitals
    hospitals_path = data_dir / "hospitals.geojson"
    if hospitals_path.exists():
        with open(hospitals_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                coords = feature.get('geometry', {}).get('coordinates', [None, None])

                facilities.append({
                    'type': 'hospital',
                    'id': props.get('id', ''),
                    'name': props.get('name', ''),
                    'short_name': props.get('short_name', ''),
                    'address': props.get('address', ''),
                    'city': props.get('city', ''),
                    'state': props.get('state', 'MD'),
                    'zip': props.get('zip_code', ''),
                    'lng': coords[0] if coords else '',
                    'lat': coords[1] if coords else '',
                    'verified': 'false',
                    'station_type': '',
                    'station_number': '',
                    'is_trauma_center': str(props.get('is_trauma_center', '')).lower(),
                    'trauma_level': props.get('trauma_level', ''),
                    'is_stemi_center': str(props.get('is_stemi_center', '')).lower(),
                    'is_stroke_center': str(props.get('is_stroke_center', '')).lower(),
                    'stroke_level': props.get('stroke_level', ''),
                    'is_burn_center': str(props.get('is_burn_center', '')).lower(),
                    'is_pediatric_center': str(props.get('is_pediatric_center', '')).lower(),
                    'has_helipad': str(props.get('has_helipad', '')).lower(),
                    'facility_type': '',
                    'bed_count': '',
                    'cms_rating': '',
                    'apparatus': ''
                })
        print(f"  Loaded {len([f for f in facilities if f['type'] == 'hospital'])} hospitals")

    # Load fire stations
    stations_path = data_dir / "fire_stations.geojson"
    if stations_path.exists():
        with open(stations_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                coords = feature.get('geometry', {}).get('coordinates', [None, None])

                # Handle apparatus as pipe-delimited string
                apparatus = props.get('apparatus', [])
                if isinstance(apparatus, list):
                    apparatus = '|'.join(apparatus)

                facilities.append({
                    'type': 'station',
                    'id': props.get('id', ''),
                    'name': props.get('station_name', ''),
                    'short_name': f"Sta {props.get('station_number', '')}",
                    'address': props.get('address', ''),
                    'city': props.get('city', ''),
                    'state': 'MD',
                    'zip': props.get('zip_code', ''),
                    'lng': coords[0] if coords else '',
                    'lat': coords[1] if coords else '',
                    'verified': 'false',
                    'station_type': props.get('station_type', 'career'),
                    'station_number': props.get('station_number', ''),
                    'is_trauma_center': '',
                    'trauma_level': '',
                    'is_stemi_center': '',
                    'is_stroke_center': '',
                    'stroke_level': '',
                    'is_burn_center': '',
                    'is_pediatric_center': '',
                    'has_helipad': '',
                    'facility_type': '',
                    'bed_count': '',
                    'cms_rating': '',
                    'apparatus': apparatus
                })
        print(f"  Loaded {len([f for f in facilities if f['type'] == 'station'])} fire stations")

    # Load nursing homes
    nursing_path = data_dir / "nursing_homes.geojson"
    if nursing_path.exists():
        with open(nursing_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for feature in data.get('features', []):
                props = feature.get('properties', {})
                coords = feature.get('geometry', {}).get('coordinates', [None, None])

                facilities.append({
                    'type': 'nursing',
                    'id': props.get('id', ''),
                    'name': props.get('name', ''),
                    'short_name': props.get('short_name', ''),
                    'address': props.get('address', ''),
                    'city': props.get('city', ''),
                    'state': props.get('state', 'MD'),
                    'zip': props.get('zip_code', ''),
                    'lng': coords[0] if coords else '',
                    'lat': coords[1] if coords else '',
                    'verified': 'false',
                    'station_type': '',
                    'station_number': '',
                    'is_trauma_center': '',
                    'trauma_level': '',
                    'is_stemi_center': '',
                    'is_stroke_center': '',
                    'stroke_level': '',
                    'is_burn_center': '',
                    'is_pediatric_center': '',
                    'has_helipad': '',
                    'facility_type': props.get('facility_type', 'nursing_home'),
                    'bed_count': props.get('bed_count', ''),
                    'cms_rating': props.get('cms_rating', ''),
                    'apparatus': ''
                })
        print(f"  Loaded {len([f for f in facilities if f['type'] == 'nursing'])} nursing homes")

    if not facilities:
        print("\nNo GeoJSON files found to export.")
        return 1

    # Save to CSV
    save_csv(facilities)

    print(f"\nExported {len(facilities)} total facilities to facilities.csv")
    print("\nYou can now edit facilities.csv in Excel or Google Sheets.")
    print("After editing, run 'generate' to update the GeoJSON files.")

    return 0


# =============================================================================
# MAIN
# =============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="Montgomery County Facility Data Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python manage_facilities.py export            # Export GeoJSON to CSV
  python manage_facilities.py download-stations # Download official fire station data
  python manage_facilities.py geocode           # Geocode addresses without coordinates
  python manage_facilities.py geocode --force   # Re-geocode all addresses
  python manage_facilities.py validate          # Check all coordinates
  python manage_facilities.py generate          # Generate GeoJSON from CSV
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # download-stations
    p_download = subparsers.add_parser('download-stations',
        help='Download official fire station data from MoCo GIS')
    p_download.set_defaults(func=cmd_download_stations)

    # download-hospitals
    p_hospitals = subparsers.add_parser('download-hospitals',
        help='Download official hospital data from MoCo GIS')
    p_hospitals.set_defaults(func=cmd_download_hospitals)

    # merge-official
    p_merge = subparsers.add_parser('merge-official',
        help='Merge official GIS data into facilities.csv')
    p_merge.set_defaults(func=cmd_merge_official)

    # geocode
    p_geocode = subparsers.add_parser('geocode',
        help='Geocode addresses to coordinates')
    p_geocode.add_argument('--force', action='store_true',
        help='Re-geocode all addresses even if coordinates exist')
    p_geocode.set_defaults(func=cmd_geocode)

    # generate
    p_generate = subparsers.add_parser('generate',
        help='Generate GeoJSON files from facilities.csv')
    p_generate.set_defaults(func=cmd_generate)

    # validate
    p_validate = subparsers.add_parser('validate',
        help='Validate coordinates are within Montgomery County')
    p_validate.set_defaults(func=cmd_validate)

    # export
    p_export = subparsers.add_parser('export',
        help='Export existing GeoJSON to CSV format')
    p_export.set_defaults(func=cmd_export)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 0

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
