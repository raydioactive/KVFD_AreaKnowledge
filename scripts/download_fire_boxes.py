"""
Montgomery County Fire Box GIS Data Downloader
Downloads fire box boundaries from MoCo GIS server

Handles pagination since ArcGIS REST API limits responses to 1000 features.
"""
import os
import sys
import requests
import json
from pathlib import Path


# MoCo GIS Fire Box Service - ArcGIS Open Data Hub (direct GeoJSON download)
# Dataset: https://opendata-mcgov-gis.hub.arcgis.com/datasets/c5876ac564294196891ddc3988c91c31
FIRE_BOX_GEOJSON_URL = "https://hub.arcgis.com/api/download/v1/items/c5876ac564294196891ddc3988c91c31/geojson?redirect=true&layers=0"

# Fallback: REST API endpoint (may be limited to 1000 features)
FIRE_BOX_URL_FALLBACK = "https://gis3.montgomerycountymd.gov/arcgis/rest/services/GDX/fire_box/MapServer/0/query"

# ArcGIS default page size for REST API fallback
PAGE_SIZE = 1000


def get_project_root():
    """Get the project root directory"""
    return Path(__file__).parent.parent


def fetch_with_pagination(url: str, timeout: int = 60) -> list:
    """
    Fetch all features from ArcGIS REST API with pagination.

    ArcGIS servers limit responses to ~1000 features per request.
    This function fetches all pages and combines them.

    Args:
        url: The ArcGIS REST API query endpoint
        timeout: Request timeout in seconds

    Returns:
        list: All features combined from all pages
    """
    all_features = []
    offset = 0

    while True:
        params = {
            'where': '1=1',  # Get all features
            'outFields': '*',  # All attributes
            'outSR': '4326',  # WGS84 (standard lat/lng)
            'f': 'geojson',  # GeoJSON format
            'resultOffset': offset,
            'resultRecordCount': PAGE_SIZE
        }

        print(f"  Fetching features {offset} to {offset + PAGE_SIZE}...")
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()

        data = response.json()

        # Check for error response
        if 'error' in data:
            raise Exception(f"ArcGIS error: {data['error'].get('message', 'Unknown error')}")

        features = data.get('features', [])

        if not features:
            break

        all_features.extend(features)
        print(f"    Got {len(features)} features (total: {len(all_features)})")

        # If we got fewer than PAGE_SIZE, we've reached the end
        if len(features) < PAGE_SIZE:
            break

        offset += PAGE_SIZE

    return all_features


def download_fire_boxes(force: bool = False) -> bool:
    """
    Download Montgomery County fire box boundaries.

    Args:
        force: If True, re-download even if file exists

    Returns:
        bool: True if successful, False otherwise
    """
    project_root = get_project_root()
    data_dir = project_root / "data" / "gis"
    data_dir.mkdir(parents=True, exist_ok=True)

    destination = data_dir / "fire_boxes.geojson"

    # Check if already downloaded
    if destination.exists() and not force:
        print(f"\n✓ Fire boxes already exist: {destination}")
        print(f"  Size: {destination.stat().st_size / 1024:.1f} KB")
        print("  Use --force to re-download")

        # Verify the existing file
        try:
            with open(destination, 'r', encoding='utf-8') as f:
                data = json.load(f)
                feature_count = len(data.get('features', []))
                print(f"  Features: {feature_count} fire boxes")

                # Warn if we might have truncated data
                if feature_count == PAGE_SIZE:
                    print(f"\n⚠️  WARNING: Exactly {PAGE_SIZE} features - data may be truncated!")
                    print("  Run with --force to re-download all features with pagination")
                return True
        except Exception as e:
            print(f"  ✗ Existing file is invalid: {e}")
            print("  Re-downloading...")

    # Download from MoCo GIS
    print("\n" + "="*60)
    print("DOWNLOADING MONTGOMERY COUNTY FIRE BOXES")
    print("="*60)
    print(f"\nPrimary source: ArcGIS Hub (direct GeoJSON)")
    print(f"Output: {destination}")

    try:
        geojson_data = None

        # Method 1: Try direct GeoJSON download from ArcGIS Hub (gets ALL features)
        print("\nMethod 1: Direct GeoJSON download from ArcGIS Hub...")
        try:
            response = requests.get(FIRE_BOX_GEOJSON_URL, timeout=120, allow_redirects=True)
            response.raise_for_status()
            geojson_data = response.json()

            if geojson_data.get('type') != 'FeatureCollection':
                raise ValueError("Invalid GeoJSON structure")

            feature_count = len(geojson_data.get('features', []))
            print(f"  ✓ Downloaded {feature_count} features from ArcGIS Hub")

        except Exception as e:
            print(f"  ✗ ArcGIS Hub download failed: {e}")

        # Method 2: Fallback to REST API with pagination
        if not geojson_data or len(geojson_data.get('features', [])) == 0:
            print(f"\nMethod 2: REST API with pagination...")
            print(f"  Source: {FIRE_BOX_URL_FALLBACK}")
            try:
                all_features = fetch_with_pagination(FIRE_BOX_URL_FALLBACK)
                if all_features:
                    geojson_data = {
                        'type': 'FeatureCollection',
                        'features': all_features
                    }
                    print(f"  ✓ Downloaded {len(all_features)} features via REST API")
            except Exception as e:
                print(f"  ✗ REST API failed: {e}")

        if not geojson_data or len(geojson_data.get('features', [])) == 0:
            print("\n✗ No features found from any source")
            return False

        all_features = geojson_data.get('features', [])

        # Filter out null/invalid features
        valid_features = [
            f for f in all_features
            if f is not None and f.get('geometry') is not None
        ]

        # Count valid polygons
        valid_polygons = sum(
            1 for f in valid_features
            if f.get('geometry', {}).get('type') in ('Polygon', 'MultiPolygon')
        )
        print(f"\n  Total features: {len(all_features)}")
        print(f"  Valid features (non-null): {len(valid_features)}")
        print(f"  Valid polygons: {valid_polygons}")

        # Use only valid features
        geojson_data['features'] = valid_features

        # Save to file
        with open(destination, 'w', encoding='utf-8') as f:
            json.dump(geojson_data, f, indent=2)

        # Success
        print(f"\n✓ Saved {len(valid_features)} fire boxes")
        print(f"  File size: {destination.stat().st_size / 1024:.1f} KB")
        print(f"  Location: {destination}")

        # Show sample attributes
        if valid_features:
            sample = valid_features[0].get('properties', {})
            print(f"\n  Sample attributes:")
            for key in list(sample.keys())[:5]:  # Show first 5 attributes
                print(f"    - {key}: {sample[key]}")

        print("\n✓ Fire box data ready for offline use!")
        return True

    except requests.exceptions.RequestException as e:
        print(f"\n✗ Download failed: {e}")
        print("\nTroubleshooting:")
        print("  1. Check internet connection")
        print("  2. Verify MoCo GIS server is accessible:")
        print(f"     {FIRE_BOX_URL}")
        print("  3. Try manual download from ArcGIS Hub:")
        print("     https://opendata-mcgov-gis.hub.arcgis.com/datasets/c5876ac564294196891ddc3988c91c31")
        return False
    except json.JSONDecodeError as e:
        print(f"\n✗ Invalid JSON response: {e}")
        return False
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download Montgomery County fire box GIS data")
    parser.add_argument("--force", action="store_true", help="Re-download even if file exists")

    args = parser.parse_args()

    print("\n" + "="*60)
    print("MOCO FIRE BOX GIS DATA DOWNLOAD")
    print("="*60)

    success = download_fire_boxes(args.force)

    if success:
        print("\n✓ Setup complete!")
        print("\nNext steps:")
        print("  1. Start backend: cd backend && venv\\Scripts\\activate && uvicorn app.main:app --reload")
        print("  2. Access fire boxes: GET http://127.0.0.1:8000/api/gis/fire-boxes")
        print("  3. Display on map: Toggle 'Show Fire Boxes' in UI")
        sys.exit(0)
    else:
        print("\n✗ Download failed. See errors above.")
        sys.exit(1)
