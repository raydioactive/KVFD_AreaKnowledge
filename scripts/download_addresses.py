"""
Montgomery County Address Points Downloader
Downloads address points from Maryland iMAP GIS service

Source: Maryland Department of Information Technology (DoIT)
Layer 17 = Montgomery County addresses
https://geodata.md.gov/appdata/rest/services/Addressing/MD_Addressing/MapServer/17
"""
import os
import sys
import requests
import json
import random
from pathlib import Path

# Maryland iMAP Address Service - Montgomery County is Layer 17
ADDRESS_URL = "https://geodata.md.gov/appdata/rest/services/Addressing/MD_Addressing/MapServer/17/query"

# ArcGIS page size - Maryland limits to 1000 per request
PAGE_SIZE = 1000


def get_project_root():
    """Get the project root directory"""
    return Path(__file__).parent.parent


def point_in_polygon(point, polygon):
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


def point_in_fire_boxes(lng, lat, fire_boxes):
    """Check if a point is within any of the given fire boxes."""
    point = [lng, lat]
    for box in fire_boxes:
        geometry = box.get('geometry', {})
        if geometry.get('type') == 'Polygon':
            if point_in_polygon(point, geometry['coordinates'][0]):
                return box.get('properties', {}).get('BEAT', 'unknown')
        elif geometry.get('type') == 'MultiPolygon':
            for polygon in geometry['coordinates']:
                if point_in_polygon(point, polygon[0]):
                    return box.get('properties', {}).get('BEAT', 'unknown')
    return None


def get_feature_count(url):
    """Get total feature count from the service."""
    params = {
        'where': '1=1',
        'returnCountOnly': 'true',
        'f': 'json'
    }
    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data.get('count', 0)


def fetch_addresses_paginated(url, max_records=None, timeout=120):
    """
    Fetch address points from ArcGIS REST API with pagination.

    Args:
        url: The ArcGIS REST API query endpoint
        max_records: Maximum records to fetch (None for all)
        timeout: Request timeout in seconds

    Returns:
        list: All features combined from all pages
    """
    all_features = []
    offset = 0

    # Get total count first
    total_count = get_feature_count(url)
    print(f"  Total addresses available: {total_count:,}")

    if max_records:
        total_to_fetch = min(max_records, total_count)
        print(f"  Fetching up to: {total_to_fetch:,}")
    else:
        total_to_fetch = total_count

    while len(all_features) < total_to_fetch:
        params = {
            'where': '1=1',
            'outFields': 'ADDRESS,ADDNUM,NAMECPLT,CITY,ZIPCODE,LAT_DD,LONG_DD,ADDTYPE',
            'outSR': '4326',
            'f': 'json',
            'resultOffset': offset,
            'resultRecordCount': PAGE_SIZE
        }

        print(f"  Fetching {offset:,} to {offset + PAGE_SIZE:,}...", end=' ')
        sys.stdout.flush()

        try:
            response = requests.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            data = response.json()

            if 'error' in data:
                print(f"Error: {data['error'].get('message', 'Unknown')}")
                break

            features = data.get('features', [])

            if not features:
                print("no more features")
                break

            all_features.extend(features)
            print(f"got {len(features):,} (total: {len(all_features):,})")

            if len(features) < PAGE_SIZE:
                break

            offset += PAGE_SIZE

            if max_records and len(all_features) >= max_records:
                break

        except requests.exceptions.Timeout:
            print("timeout, retrying...")
            continue
        except Exception as e:
            print(f"error: {e}")
            break

    return all_features


def convert_to_geojson(features):
    """Convert ArcGIS JSON features to GeoJSON format."""
    geojson_features = []

    for f in features:
        attrs = f.get('attributes', {})
        geom = f.get('geometry', {})

        # Skip if no coordinates
        lng = attrs.get('LONG_DD') or geom.get('x')
        lat = attrs.get('LAT_DD') or geom.get('y')

        if not lng or not lat:
            continue

        # Skip addresses without a street number (not useful for quiz)
        if not attrs.get('ADDNUM'):
            continue

        geojson_features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(lng), float(lat)]
            },
            'properties': {
                'address': attrs.get('ADDRESS', ''),
                'street_number': attrs.get('ADDNUM', ''),
                'street_name': attrs.get('NAMECPLT', ''),
                'city': attrs.get('CITY', ''),
                'zip': attrs.get('ZIPCODE', ''),
                'type': attrs.get('ADDTYPE', '')
            }
        })

    return {
        'type': 'FeatureCollection',
        'features': geojson_features
    }


def sample_addresses_by_fire_box(addresses, fire_boxes, samples_per_box=50):
    """
    Sample addresses evenly across fire boxes.

    This ensures good coverage of the entire station area.
    """
    # Group addresses by fire box
    addresses_by_box = {}
    unassigned = []

    print(f"\n  Assigning {len(addresses['features']):,} addresses to fire boxes...")

    for feature in addresses['features']:
        coords = feature['geometry']['coordinates']
        lng, lat = coords[0], coords[1]

        beat = point_in_fire_boxes(lng, lat, fire_boxes)

        if beat:
            if beat not in addresses_by_box:
                addresses_by_box[beat] = []
            addresses_by_box[beat].append(feature)
        else:
            unassigned.append(feature)

    print(f"  Assigned to {len(addresses_by_box)} fire boxes")
    print(f"  Unassigned (outside fire boxes): {len(unassigned):,}")

    # Sample from each box
    sampled = []
    for beat, addr_list in addresses_by_box.items():
        sample_size = min(samples_per_box, len(addr_list))
        sampled.extend(random.sample(addr_list, sample_size))

        # Add beat ID to properties
        for addr in sampled[-sample_size:]:
            addr['properties']['beat'] = beat

    print(f"  Sampled {len(sampled):,} addresses across all boxes")

    return {
        'type': 'FeatureCollection',
        'features': sampled
    }


def download_addresses_for_station(station_pattern, force=False):
    """
    Download ALL addresses for a specific station's first-due area.

    Args:
        station_pattern: Station pattern (e.g., '05' for station 5)
        force: Re-download even if file exists

    Returns:
        bool: True if successful
    """
    project_root = get_project_root()
    data_dir = project_root / "data" / "gis"
    data_dir.mkdir(parents=True, exist_ok=True)

    # Station-specific output file
    destination = data_dir / f"addresses_station_{station_pattern}.geojson"
    fire_boxes_file = data_dir / "fire_boxes.geojson"

    # Check existing file
    if destination.exists() and not force:
        print(f"\n✓ Addresses for station {station_pattern} already exist: {destination}")
        print(f"  Size: {destination.stat().st_size / 1024 / 1024:.1f} MB")
        with open(destination, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"  Features: {len(data.get('features', []))} addresses")
        print("  Use --force to re-download")
        return True

    # Load fire boxes
    if not fire_boxes_file.exists():
        print("\n✗ Fire boxes not found. Run download_fire_boxes.py first.")
        return False

    with open(fire_boxes_file, 'r', encoding='utf-8') as f:
        fire_boxes_data = json.load(f)
        all_fire_boxes = fire_boxes_data.get('features', [])

    # Get fire boxes for this station
    station_boxes = [
        box for box in all_fire_boxes
        if box.get('properties', {}).get('BEAT', '').startswith(station_pattern)
    ]

    if not station_boxes:
        print(f"\n✗ No fire boxes found for station pattern '{station_pattern}'")
        return False

    print(f"\n  Station {station_pattern}: {len(station_boxes)} fire boxes")

    print("\n" + "="*60)
    print(f"DOWNLOADING ADDRESSES FOR STATION {station_pattern}")
    print("="*60)
    print(f"\nSource: Maryland iMAP - Montgomery County (Layer 17)")
    print(f"Output: {destination}")

    try:
        # We need to download ALL addresses and filter
        # This takes a while but ensures complete coverage
        print(f"\nFetching ALL Montgomery County addresses...")
        print("  (This may take a few minutes...)")

        raw_features = fetch_addresses_paginated(ADDRESS_URL, max_records=None)

        if not raw_features:
            print("\n✗ No addresses downloaded")
            return False

        print(f"\n  Downloaded {len(raw_features):,} raw address records")

        # Convert to GeoJSON
        print("  Converting to GeoJSON...")
        addresses = convert_to_geojson(raw_features)
        print(f"  Valid addresses with coordinates: {len(addresses['features']):,}")

        # Filter to station's fire boxes only
        print(f"\n  Filtering to station {station_pattern}'s area...")
        station_addresses = []

        for addr in addresses['features']:
            coords = addr['geometry']['coordinates']
            lng, lat = coords[0], coords[1]

            beat = point_in_fire_boxes(lng, lat, station_boxes)
            if beat:
                addr['properties']['beat'] = beat
                station_addresses.append(addr)

        print(f"  Found {len(station_addresses):,} addresses in station {station_pattern}'s area")

        if not station_addresses:
            print("\n✗ No addresses found in station's area")
            return False

        # Save
        result = {
            'type': 'FeatureCollection',
            'properties': {
                'station_pattern': station_pattern,
                'fire_box_count': len(station_boxes)
            },
            'features': station_addresses
        }

        print(f"\n  Saving {len(station_addresses):,} addresses...")
        with open(destination, 'w', encoding='utf-8') as f:
            json.dump(result, f)

        file_size = destination.stat().st_size / 1024 / 1024
        print(f"\n✓ Saved to {destination}")
        print(f"  File size: {file_size:.1f} MB")
        print(f"  Total addresses: {len(station_addresses):,}")

        # Show sample
        if station_addresses:
            sample = station_addresses[0]['properties']
            print(f"\n  Sample address:")
            print(f"    {sample.get('address', 'N/A')}")
            print(f"    {sample.get('city', '')}, MD {sample.get('zip', '')}")
            print(f"    Fire box: {sample.get('beat', 'N/A')}")

        # Also update the main addresses.geojson as a symlink/copy for the quiz
        main_dest = data_dir / "addresses.geojson"
        with open(main_dest, 'w', encoding='utf-8') as f:
            json.dump(result, f)
        print(f"\n  Also updated: {main_dest}")

        return True

    except Exception as e:
        print(f"\n✗ Download failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def download_addresses(force=False, sample_size=None, filter_by_fire_boxes=True):
    """
    Download Montgomery County address points (legacy - samples across all boxes).

    Args:
        force: Re-download even if file exists
        sample_size: Max addresses per fire box (None for all)
        filter_by_fire_boxes: Only include addresses within fire boxes

    Returns:
        bool: True if successful
    """
    project_root = get_project_root()
    data_dir = project_root / "data" / "gis"
    data_dir.mkdir(parents=True, exist_ok=True)

    destination = data_dir / "addresses.geojson"
    fire_boxes_file = data_dir / "fire_boxes.geojson"

    # Check existing file
    if destination.exists() and not force:
        print(f"\n✓ Addresses already exist: {destination}")
        print(f"  Size: {destination.stat().st_size / 1024 / 1024:.1f} MB")
        with open(destination, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"  Features: {len(data.get('features', []))} addresses")
        print("  Use --force to re-download")
        return True

    # Load fire boxes for filtering
    fire_boxes = []
    if filter_by_fire_boxes:
        if not fire_boxes_file.exists():
            print("\n⚠️  Fire boxes not found. Run download_fire_boxes.py first.")
            print("   Downloading all addresses without filtering...")
            filter_by_fire_boxes = False
        else:
            with open(fire_boxes_file, 'r', encoding='utf-8') as f:
                fire_boxes_data = json.load(f)
                fire_boxes = fire_boxes_data.get('features', [])
                print(f"\n  Loaded {len(fire_boxes)} fire boxes for filtering")

    print("\n" + "="*60)
    print("DOWNLOADING MONTGOMERY COUNTY ADDRESSES")
    print("="*60)
    print(f"\nSource: Maryland iMAP - Montgomery County (Layer 17)")
    print(f"Output: {destination}")

    try:
        # Fetch addresses - limit to avoid huge downloads
        # For quiz purposes, we don't need ALL addresses
        max_fetch = 100000

        print(f"\nFetching addresses (max {max_fetch:,} for quiz dataset)...")
        raw_features = fetch_addresses_paginated(ADDRESS_URL, max_records=max_fetch)

        if not raw_features:
            print("\n✗ No addresses downloaded")
            return False

        print(f"\n  Downloaded {len(raw_features):,} raw address records")

        # Convert to GeoJSON
        print("  Converting to GeoJSON...")
        addresses = convert_to_geojson(raw_features)
        print(f"  Valid addresses with coordinates: {len(addresses['features']):,}")

        # Filter/sample by fire boxes
        if filter_by_fire_boxes and fire_boxes:
            addresses = sample_addresses_by_fire_box(
                addresses,
                fire_boxes,
                samples_per_box=sample_size or 100
            )

        # Save
        print(f"\n  Saving {len(addresses['features']):,} addresses...")
        with open(destination, 'w', encoding='utf-8') as f:
            json.dump(addresses, f)

        file_size = destination.stat().st_size / 1024 / 1024
        print(f"\n✓ Saved to {destination}")
        print(f"  File size: {file_size:.1f} MB")
        print(f"  Total addresses: {len(addresses['features']):,}")

        # Show sample
        if addresses['features']:
            sample = addresses['features'][0]['properties']
            print(f"\n  Sample address:")
            print(f"    {sample.get('address', 'N/A')}")
            print(f"    {sample.get('city', '')}, MD {sample.get('zip', '')}")
            if sample.get('beat'):
                print(f"    Fire box: {sample['beat']}")

        return True

    except Exception as e:
        print(f"\n✗ Download failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def download_all_addresses(force=False):
    """
    Download ALL Montgomery County addresses (no filtering).

    Args:
        force: Re-download even if file exists

    Returns:
        bool: True if successful
    """
    project_root = get_project_root()
    data_dir = project_root / "data" / "gis"
    data_dir.mkdir(parents=True, exist_ok=True)

    destination = data_dir / "addresses_all.geojson"

    # Check existing file
    if destination.exists() and not force:
        print(f"\n✓ All addresses already exist: {destination}")
        print(f"  Size: {destination.stat().st_size / 1024 / 1024:.1f} MB")
        with open(destination, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"  Features: {len(data.get('features', []))} addresses")
        print("  Use --force to re-download")
        return True

    print("\n" + "="*60)
    print("DOWNLOADING ALL MONTGOMERY COUNTY ADDRESSES")
    print("="*60)
    print(f"\nSource: Maryland iMAP - Montgomery County (Layer 17)")
    print(f"Output: {destination}")
    print("\n⚠️  This will download ~293,000 addresses and take several minutes...")

    try:
        print(f"\nFetching ALL addresses...")
        raw_features = fetch_addresses_paginated(ADDRESS_URL, max_records=None)

        if not raw_features:
            print("\n✗ No addresses downloaded")
            return False

        print(f"\n  Downloaded {len(raw_features):,} raw address records")

        # Convert to GeoJSON
        print("  Converting to GeoJSON...")
        addresses = convert_to_geojson(raw_features)
        print(f"  Valid addresses with coordinates: {len(addresses['features']):,}")

        # Save
        print(f"\n  Saving {len(addresses['features']):,} addresses...")
        with open(destination, 'w', encoding='utf-8') as f:
            json.dump(addresses, f)

        file_size = destination.stat().st_size / 1024 / 1024
        print(f"\n✓ Saved to {destination}")
        print(f"  File size: {file_size:.1f} MB")
        print(f"  Total addresses: {len(addresses['features']):,}")

        return True

    except Exception as e:
        print(f"\n✗ Download failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download Montgomery County address data")
    parser.add_argument("--station", type=str,
                       help="Station pattern to download (e.g., '05' for station 5). Downloads ALL addresses for that station's area.")
    parser.add_argument("--all", action="store_true",
                       help="Download ALL Montgomery County addresses (~293k, takes several minutes)")
    parser.add_argument("--force", action="store_true", help="Re-download even if file exists")
    parser.add_argument("--samples-per-box", type=int, default=100,
                       help="Addresses to sample per fire box (default: 100, only used without --station)")
    parser.add_argument("--no-filter", action="store_true",
                       help="Don't filter by fire boxes")

    args = parser.parse_args()

    print("\n" + "="*60)
    print("MONTGOMERY COUNTY ADDRESS DOWNLOAD")
    print("="*60)

    if args.all:
        # Download ALL addresses (no filtering)
        success = download_all_addresses(force=args.force)
    elif args.station:
        # Download ALL addresses for a specific station
        # Pad station number to 2 digits if needed
        station_pattern = args.station.zfill(2)
        success = download_addresses_for_station(station_pattern, force=args.force)
    else:
        # Legacy: sample addresses across all boxes
        success = download_addresses(
            force=args.force,
            sample_size=args.samples_per_box,
            filter_by_fire_boxes=not args.no_filter
        )

    if success:
        print("\n✓ Address data ready!")
        print("\nThe quiz will now use real addresses from your station's area.")
        sys.exit(0)
    else:
        print("\n✗ Download failed")
        sys.exit(1)
