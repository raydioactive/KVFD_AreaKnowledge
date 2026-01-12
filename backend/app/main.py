"""
MoCo EMS Trainer - FastAPI Backend
Main application entry point
"""
import os
import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import argparse

# Add app directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from config.features import get_features
from database import check_database, initialize_database
from routers import tiles, routing, gis, facilities, quiz

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="MoCo EMS Trainer API",
    description="Montgomery County EMS Area Familiarization & Destination Trainer",
    version="1.0.0"
)

# Configure CORS to allow Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify Electron's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tiles.router)
app.include_router(routing.router)
app.include_router(gis.router)
app.include_router(facilities.router)
app.include_router(quiz.router)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup if needed"""
    logger.info("Starting MoCo EMS Trainer API...")

    # Check if database is initialized
    if not check_database():
        logger.info("Database not initialized. Initializing...")
        try:
            initialize_database()
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    logger.info("API startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down MoCo EMS Trainer API...")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "MoCo EMS Trainer API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint for Electron to verify backend is running.

    Returns:
        dict: Health status
    """
    db_ready = check_database()

    return {
        "status": "healthy" if db_ready else "degraded",
        "database": "ready" if db_ready else "not initialized",
        "version": "1.0.0"
    }


@app.get("/api/features")
async def get_feature_flags():
    """
    Get current feature flags configuration.

    Returns:
        dict: Feature flags
    """
    try:
        features = get_features()
        return features
    except Exception as e:
        logger.error(f"Error getting features: {e}")
        raise HTTPException(status_code=500, detail="Failed to get feature flags")


# Placeholder endpoints for future implementation

@app.get("/api/stations")
async def get_stations():
    """Get all fire stations (placeholder)"""
    return {"stations": [], "count": 0}


@app.get("/api/beats")
async def get_beats(station_id: int = None):
    """Get beats, optionally filtered by station (placeholder)"""
    return {"beats": [], "count": 0}


@app.get("/api/facilities")
async def get_facilities(
    type: str = None,
    station_id: int = None,
    capability: str = None
):
    """Get facilities with optional filters (placeholder)"""
    return {"facilities": [], "count": 0}


@app.get("/styles/{style_name}")
async def get_map_style(style_name: str):
    """
    Serve map style JSON files.

    Args:
        style_name: Name of the style file (e.g., training-mode.json)

    Returns:
        JSON: MapLibre style specification
    """
    import json

    # Get the styles directory
    project_root = Path(__file__).parent.parent.parent
    styles_dir = project_root / "tiles" / "styles"
    style_path = styles_dir / style_name

    if not style_path.exists():
        raise HTTPException(status_code=404, detail="Style not found")

    try:
        with open(style_path, 'r', encoding='utf-8') as f:
            style_data = json.load(f)

        # Update tile URLs to use current API port if needed
        # This ensures the style points to the correct local server
        if 'sources' in style_data:
            for source_name, source_config in style_data['sources'].items():
                if 'tiles' in source_config and isinstance(source_config['tiles'], list):
                    # Replace localhost:8000 with actual host if different
                    updated_tiles = []
                    for tile_url in source_config['tiles']:
                        # Keep the URL as-is since it's already configured correctly
                        updated_tiles.append(tile_url)
                    source_config['tiles'] = updated_tiles

        return JSONResponse(content=style_data)

    except Exception as e:
        logger.error(f"Error loading style: {e}")
        raise HTTPException(status_code=500, detail="Failed to load style")


def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="MoCo EMS Trainer API Server")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to run the server on (default: 8000)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)"
    )
    return parser.parse_args()


if __name__ == "__main__":
    import uvicorn

    args = parse_args()

    logger.info(f"Starting server on {args.host}:{args.port}")

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=False,  # Disable reload when bundled
        log_level="info"
    )
