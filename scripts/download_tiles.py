"""
Automated Map Tile Downloader
Downloads Maryland OpenMapTiles for offline use
"""
import os
import sys
import requests
from pathlib import Path
from tqdm import tqdm
import hashlib


# Planetiler for tile generation
PLANETILER_SOURCE = {
    "name": "Planetiler",
    "version": "latest",
    "url": "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar",
    "filename": "planetiler.jar",
    "description": "Tile generator (converts OSM to MBTiles)"
}

# OSM data for routing
MARYLAND_OSM_SOURCE = {
    "name": "Maryland OSM PBF",
    "url": "https://download.geofabrik.de/north-america/us/maryland-latest.osm.pbf",
    "filename": "maryland-latest.osm.pbf",
    "description": "OpenStreetMap data for Maryland (for routing)"
}


def get_project_root():
    """Get the project root directory"""
    return Path(__file__).parent.parent


def download_file(url: str, destination: Path, description: str = "") -> bool:
    """
    Download a file with progress bar.

    Args:
        url: URL to download from
        destination: Path to save file
        description: Description for progress bar

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        print(f"\nDownloading: {description or url}")
        print(f"Destination: {destination}")

        # Create directory if it doesn't exist
        destination.parent.mkdir(parents=True, exist_ok=True)

        # Stream download with progress bar
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))
        block_size = 8192

        # Import tqdm properly
        from tqdm.auto import tqdm as progress_bar

        with open(destination, 'wb') as f, progress_bar(
            total=total_size,
            unit='B',
            unit_scale=True,
            unit_divisor=1024,
            desc=description or destination.name,
            ascii=True
        ) as pbar:
            for chunk in response.iter_content(chunk_size=block_size):
                if chunk:
                    f.write(chunk)
                    pbar.update(len(chunk))

        print(f"✓ Downloaded successfully: {destination.name}")
        print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
        return True

    except requests.exceptions.RequestException as e:
        print(f"✗ Download failed: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False


def verify_mbtiles(file_path: Path) -> bool:
    """
    Verify that an MBTiles file is valid SQLite database.

    Args:
        file_path: Path to MBTiles file

    Returns:
        bool: True if valid, False otherwise
    """
    try:
        import sqlite3
        conn = sqlite3.connect(str(file_path))
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tiles'")
        result = cursor.fetchone()
        conn.close()

        if result:
            print(f"✓ Verified: {file_path.name} is a valid MBTiles file")
            return True
        else:
            print(f"✗ Invalid: {file_path.name} is not a valid MBTiles file")
            return False
    except Exception as e:
        print(f"✗ Verification failed: {e}")
        return False


def download_planetiler(force: bool = False) -> bool:
    """
    Download Planetiler JAR for tile generation.

    Args:
        force: If True, re-download even if file exists

    Returns:
        bool: True if successful, False otherwise
    """
    project_root = get_project_root()
    tools_dir = project_root / "routing" / "planetiler"
    tools_dir.mkdir(parents=True, exist_ok=True)

    destination = tools_dir / PLANETILER_SOURCE["filename"]

    # Check if already downloaded
    if destination.exists() and not force:
        print(f"\n✓ Planetiler already exists: {destination}")
        print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
        return True

    # Download
    print("\n" + "="*60)
    print("DOWNLOADING PLANETILER TILE GENERATOR")
    print("="*60)

    success = download_file(
        PLANETILER_SOURCE["url"],
        destination,
        PLANETILER_SOURCE["description"]
    )

    if success:
        print("\n✓ Planetiler ready!")
        return True
    else:
        print("\n✗ Failed to download Planetiler")
        return False


def generate_maryland_tiles(force: bool = False) -> bool:
    """
    Generate Maryland map tiles from OSM data using Planetiler.

    Args:
        force: If True, regenerate even if tiles exist

    Returns:
        bool: True if successful, False otherwise
    """
    import subprocess
    import shutil

    project_root = get_project_root()
    tiles_dir = project_root / "tiles"
    tiles_dir.mkdir(parents=True, exist_ok=True)

    destination = tiles_dir / "maryland.mbtiles"

    # Check if already generated
    if destination.exists() and not force:
        print(f"\n✓ Tiles already exist: {destination}")
        print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
        print("  Use --force to regenerate")

        # Verify the existing file
        if verify_mbtiles(destination):
            return True
        else:
            print("  Existing file is invalid, regenerating...")

    # Check prerequisites
    planetiler_jar = project_root / "routing" / "planetiler" / PLANETILER_SOURCE["filename"]
    if not planetiler_jar.exists():
        print("\n✗ Planetiler not found. Downloading first...")
        if not download_planetiler():
            return False

    osm_file = project_root / "routing" / "graphhopper" / MARYLAND_OSM_SOURCE["filename"]
    if not osm_file.exists():
        print("\n✗ OSM data not found. Please download first.")
        print(f"  Run: python scripts/download_tiles.py --osm-only")
        return False

    # Check Java
    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            print("\n✗ Java not found. Please install Java 21+ from: https://adoptium.net/")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("\n✗ Java not found. Please install Java 21+ from: https://adoptium.net/")
        return False

    # Generate tiles
    print("\n" + "="*60)
    print("GENERATING MARYLAND MAP TILES")
    print("="*60)
    print("\n⚠️  IMPORTANT: Tile generation takes 5-15 minutes")
    print("This is a ONE-TIME process. Subsequent runs will be instant.\n")
    print(f"Input:  {osm_file} ({osm_file.stat().st_size / (1024*1024):.1f} MB)")
    print(f"Output: {destination}")
    print("\nProcessing...")

    # Planetiler command with FASTER download settings
    command = [
        "java",
        "-Xmx4g",  # 4GB heap
        "-jar", str(planetiler_jar),
        "--download",  # Download natural earth & water data
        "--area=maryland",
        f"--osm-path={osm_file}",
        f"--output={destination}",
        "--maxzoom=14",
        "--minzoom=0",
        # FASTER DOWNLOAD SETTINGS (with correct ISO-8601 duration format)
        "--download-threads=4",  # Parallel downloads (default: 1)
        "--download-chunk-size-mb=500",  # Larger chunks (default: 100)
        "--http-retries=3",  # Fewer retries (default: 5)
        "--http-timeout=PT60S"  # 60 seconds timeout (ISO-8601 format)
    ]

    try:
        # Run Planetiler
        print("\nRunning Planetiler (this will take several minutes)...\n")
        result = subprocess.run(
            command,
            cwd=project_root,
            capture_output=False,  # Show output in real-time
            text=True,
            timeout=1800  # 30 minute timeout
        )

        if result.returncode == 0 and destination.exists():
            # Verify generated file
            if verify_mbtiles(destination):
                print("\n" + "="*60)
                print("✓ TILE GENERATION COMPLETE!")
                print("="*60)
                print(f"  Output: {destination}")
                print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
                print("\n✓ Maryland tiles ready for offline use!")
                return True
            else:
                print("\n✗ Generated file is invalid")
                return False
        else:
            print(f"\n✗ Tile generation failed (exit code: {result.returncode})")
            return False

    except subprocess.TimeoutExpired:
        print("\n✗ Tile generation timed out (>30 minutes)")
        return False
    except Exception as e:
        print(f"\n✗ Unexpected error during generation: {e}")
        return False


def download_maryland_osm(force: bool = False) -> bool:
    """
    Download Maryland OSM data for routing.

    Args:
        force: If True, re-download even if file exists

    Returns:
        bool: True if successful, False otherwise
    """
    project_root = get_project_root()
    routing_dir = project_root / "routing" / "graphhopper"
    routing_dir.mkdir(parents=True, exist_ok=True)

    destination = routing_dir / MARYLAND_OSM_SOURCE["filename"]

    # Check if already downloaded
    if destination.exists() and not force:
        print(f"\n✓ OSM data already exists: {destination}")
        print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
        print("  Use --force to re-download")
        return True

    # Download
    print("\n" + "="*60)
    print("DOWNLOADING MARYLAND OSM DATA (for routing)")
    print("="*60)

    success = download_file(
        MARYLAND_OSM_SOURCE["url"],
        destination,
        MARYLAND_OSM_SOURCE["description"]
    )

    if success:
        print("\n✓ OSM data ready for routing!")
        return True
    else:
        print("\n✗ Failed to download OSM data")
        return False


def download_graphhopper_jar(force: bool = False) -> bool:
    """
    Download GraphHopper JAR file.

    Args:
        force: If True, re-download even if file exists

    Returns:
        bool: True if successful, False otherwise
    """
    project_root = get_project_root()
    routing_dir = project_root / "routing" / "graphhopper"
    routing_dir.mkdir(parents=True, exist_ok=True)

    # GraphHopper version
    GH_VERSION = "8.0"
    jar_filename = f"graphhopper-web-{GH_VERSION}.jar"
    destination = routing_dir / jar_filename

    # Check if already downloaded
    if destination.exists() and not force:
        print(f"\n✓ GraphHopper JAR already exists: {destination}")
        print(f"  Size: {destination.stat().st_size / (1024*1024):.1f} MB")
        return True

    # Download
    print("\n" + "="*60)
    print("DOWNLOADING GRAPHHOPPER ROUTING ENGINE")
    print("="*60)

    url = f"https://github.com/graphhopper/graphhopper/releases/download/{GH_VERSION}/{jar_filename}"

    success = download_file(
        url,
        destination,
        f"GraphHopper {GH_VERSION} JAR"
    )

    if success:
        print("\n✓ GraphHopper ready!")
        return True
    else:
        print("\n✗ Failed to download GraphHopper")
        print("\nManual download instructions:")
        print(f"1. Visit: https://github.com/graphhopper/graphhopper/releases")
        print(f"2. Download: graphhopper-web-{GH_VERSION}.jar")
        print(f"3. Save to: {destination}")
        return False


def download_all(force: bool = False) -> bool:
    """
    Download all required data files and generate tiles.

    Args:
        force: If True, re-download even if files exist

    Returns:
        bool: True if all downloads successful
    """
    print("\n" + "="*60)
    print("MOCO EMS TRAINER - OFFLINE DATA SETUP")
    print("="*60)
    print("\nThis will:")
    print("  1. Download Maryland OSM Data (~200 MB)")
    print("  2. Download GraphHopper Routing Engine (~45 MB)")
    print("  3. Download Planetiler Tile Generator (~90 MB)")
    print("  4. Generate offline map tiles (10-20 minutes)")
    print("     - Includes water features & natural earth data")
    print("\nTotal download size: ~1.5 GB (one-time)")
    print("Generated tiles: ~300-600 MB")
    print("="*60)

    # Step 1: Download prerequisites
    results = {
        "osm": download_maryland_osm(force),
        "graphhopper": download_graphhopper_jar(force),
        "planetiler": download_planetiler(force)
    }

    print("\n" + "="*60)
    print("DOWNLOAD SUMMARY")
    print("="*60)
    print(f"  OSM Data:     {'✓ Success' if results['osm'] else '✗ Failed'}")
    print(f"  GraphHopper:  {'✓ Success' if results['graphhopper'] else '✗ Failed'}")
    print(f"  Planetiler:   {'✓ Success' if results['planetiler'] else '✗ Failed'}")
    print("="*60)

    if not all(results.values()):
        print("\n✗ Some downloads failed. Please check errors above.")
        return False

    # Step 2: Generate tiles
    print("\n" + "="*60)
    print("STEP 2: TILE GENERATION")
    print("="*60)

    tiles_success = generate_maryland_tiles(force)

    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)
    print(f"  Downloads:       ✓ Success")
    print(f"  Tile Generation: {'✓ Success' if tiles_success else '✗ Failed'}")
    print("="*60)

    if tiles_success:
        print("\n✓ All setup complete! App is ready for 100% offline use.")
        print("\nNext steps:")
        print("  1. Run: .\\start-dev.ps1")
        print("     (This starts all 4 services automatically)")
        return True
    else:
        print("\n✗ Tile generation failed. Check errors above.")
        print("\nYou can retry just tile generation with:")
        print("  python scripts/download_tiles.py --tiles-only")
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Download map tiles and routing data")
    parser.add_argument("--force", action="store_true", help="Re-download even if files exist")
    parser.add_argument("--tiles-only", action="store_true", help="Generate tiles only (skip downloads)")
    parser.add_argument("--osm-only", action="store_true", help="Download only OSM data")
    parser.add_argument("--graphhopper-only", action="store_true", help="Download only GraphHopper JAR")

    args = parser.parse_args()

    # Install tqdm if not available
    try:
        import tqdm
    except ImportError:
        print("Installing required package: tqdm")
        os.system(f"{sys.executable} -m pip install tqdm")
        import tqdm

    # Run specific download or all
    if args.tiles_only:
        generate_maryland_tiles(args.force)
    elif args.osm_only:
        download_maryland_osm(args.force)
    elif args.graphhopper_only:
        download_graphhopper_jar(args.force)
    else:
        download_all(args.force)