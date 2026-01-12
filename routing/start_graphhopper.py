"""
GraphHopper Routing Engine Starter
Spawns GraphHopper Java server for local routing
"""
import os
import subprocess
import sys
import time
from pathlib import Path
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def find_graphhopper_jar() -> Path | None:
    """
    Find the GraphHopper JAR file.

    Returns:
        Path: Path to JAR file or None if not found
    """
    graphhopper_dir = Path(__file__).parent / "graphhopper"

    # Look for any graphhopper-web-*.jar file
    jar_files = list(graphhopper_dir.glob("graphhopper-web-*.jar"))

    if not jar_files:
        return None

    # Return the first (or only) JAR file found
    return jar_files[0]


def check_java() -> bool:
    """
    Check if Java is installed and accessible.

    Returns:
        bool: True if Java is available
    """
    try:
        result = subprocess.run(
            ["java", "-version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Parse Java version from stderr (Java outputs version to stderr)
            version_output = result.stderr
            logger.info(f"Java found: {version_output.splitlines()[0]}")
            return True
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def wait_for_graphhopper(port: int = 8989, max_attempts: int = 900) -> bool:
    """
    Wait for GraphHopper to be ready.

    Args:
        port: GraphHopper port
        max_attempts: Maximum number of attempts (seconds)

    Returns:
        bool: True if ready, False if timeout
    """
    logger.info("Waiting for GraphHopper to be ready...")

    for attempt in range(max_attempts):
        try:
            response = requests.get(f"http://127.0.0.1:{port}/health", timeout=1)
            if response.status_code == 200:
                logger.info("✓ GraphHopper is ready!")
                return True
        except requests.exceptions.RequestException:
            pass

        # Print progress every 5 seconds
        if (attempt + 1) % 5 == 0:
            logger.info(f"Still waiting... ({attempt + 1}s)")

        time.sleep(5)

    logger.error("✗ GraphHopper failed to start within timeout")
    return False


def start_graphhopper(
    port: int = 8989,
    memory_gb: int = 1,
    wait: bool = True,
    verbose: bool = False
) -> subprocess.Popen | None:
    """
    Start the GraphHopper routing server.

    Args:
        port: Port to run GraphHopper on
        memory_gb: Java heap size in GB
        wait: Wait for server to be ready
        verbose: Enable verbose logging

    Returns:
        subprocess.Popen: Process handle or None if failed
    """
    logger.info("=" * 60)
    logger.info("STARTING GRAPHHOPPER ROUTING ENGINE")
    logger.info("=" * 60)

    # Check Java
    if not check_java():
        logger.error("✗ Java not found!")
        logger.error("Please install Java 11+ from: https://adoptium.net/")
        return None

    # Find JAR file
    jar_path = find_graphhopper_jar()
    if not jar_path:
        logger.error("✗ GraphHopper JAR not found!")
        logger.error("Please run: python scripts/download_tiles.py")
        return None

    logger.info(f"Found JAR: {jar_path.name}")

    # Check config file
    config_path = Path(__file__).parent / "graphhopper" / "config.yml"
    if not config_path.exists():
        logger.error(f"✗ Config file not found: {config_path}")
        return None

    logger.info(f"Using config: {config_path}")

    # Check OSM data
    osm_path = Path(__file__).parent / "graphhopper" / "maryland-latest.osm.pbf"
    if not osm_path.exists():
        logger.warning("✗ OSM data file not found!")
        logger.warning("Please run: python scripts/download_tiles.py")
        logger.warning("GraphHopper will fail to start without OSM data.")
        # Don't return - let GraphHopper show its own error

    # Prepare Java command
    java_opts = [
        f"-Xmx{memory_gb}g",
        f"-Xms{memory_gb // 2}g",
        "-Ddw.graphhopper.datareader.file=maryland-latest.osm.pbf"
        # Removed port override - it's in config.yml now
    ]

    command = [
        "java",
        *java_opts,
        "-jar", str(jar_path),
        "server", str(config_path)
    ]

    logger.info("\nStarting GraphHopper server...")
    logger.info(f"Port: {port}")
    logger.info(f"Memory: {memory_gb}GB")

    # Check if graph cache exists
    graph_cache = Path(__file__).parent / "graphhopper" / "graph-cache"
    if not graph_cache.exists():
        logger.info("\n⚠️  First run detected!")
        logger.info("GraphHopper will build the routing graph from OSM data.")
        logger.info("This process takes ~5-10 minutes for Maryland.")
        logger.info("Subsequent starts will be much faster.")
        logger.info("")

    try:
        # Start GraphHopper process
        process = subprocess.Popen(
            command,
            cwd=Path(__file__).parent / "graphhopper",
            stdout=subprocess.PIPE if not verbose else None,
            stderr=subprocess.STDOUT if not verbose else None,
            text=True
        )

        logger.info(f"✓ GraphHopper process started (PID: {process.pid})")

        # Wait for it to be ready
        if wait:
            if wait_for_graphhopper(port):
                logger.info("\n" + "=" * 60)
                logger.info("GRAPHHOPPER READY FOR ROUTING")
                logger.info("=" * 60)
                logger.info(f"API: http://127.0.0.1:{port}")
                logger.info(f"Health: http://127.0.0.1:{port}/health")
                logger.info("=" * 60)
                return process
            else:
                logger.error("GraphHopper failed to become ready")
                process.kill()
                return None

        return process

    except Exception as e:
        logger.error(f"✗ Failed to start GraphHopper: {e}")
        return None


def stop_graphhopper(process: subprocess.Popen):
    """
    Stop the GraphHopper server.

    Args:
        process: GraphHopper process handle
    """
    if process:
        logger.info("Stopping GraphHopper...")
        process.terminate()
        try:
            process.wait(timeout=10)
            logger.info("✓ GraphHopper stopped")
        except subprocess.TimeoutExpired:
            logger.warning("GraphHopper didn't stop gracefully, killing...")
            process.kill()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Start GraphHopper routing server")
    parser.add_argument("--port", type=int, default=8989, help="Port to run on (default: 8989)")
    parser.add_argument("--memory", type=int, default=5, help="Java heap size in GB (default: 1)")
    parser.add_argument("--no-wait", action="store_true", help="Don't wait for server to be ready")
    parser.add_argument("--verbose", action="store_true", help="Show GraphHopper output")

    args = parser.parse_args()

    try:
        process = start_graphhopper(
            port=args.port,
            memory_gb=args.memory,
            wait=not args.no_wait,
            verbose=args.verbose
        )

        if process:
            logger.info("\nPress Ctrl+C to stop GraphHopper...")
            try:
                # Keep running until interrupted
                process.wait()
            except KeyboardInterrupt:
                logger.info("\nShutdown requested...")
                stop_graphhopper(process)
        else:
            sys.exit(1)

    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)
