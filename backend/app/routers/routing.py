"""
Routing API Router
Provides turn-by-turn routing via GraphHopper
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Tuple
import logging

from services.routing_service import routing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routing", tags=["routing"])


class RouteRequest(BaseModel):
    """Request model for route calculation"""
    origin_lat: float = Field(..., description="Origin latitude", ge=-90, le=90)
    origin_lng: float = Field(..., description="Origin longitude", ge=-180, le=180)
    destination_lat: float = Field(..., description="Destination latitude", ge=-90, le=90)
    destination_lng: float = Field(..., description="Destination longitude", ge=-180, le=180)
    profile: str = Field("car", description="Routing profile (car or emergency)")


class RouteResponse(BaseModel):
    """Response model for calculated route"""
    geometry: List[Tuple[float, float]]
    duration_minutes: float
    distance_km: float
    distance_miles: float
    maneuvers: List[dict]
    profile: str


@router.post("/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    """
    Calculate a route from origin to destination.

    Args:
        request: Route request with origin, destination, and profile

    Returns:
        RouteResponse: Route with geometry, duration, distance, and turn-by-turn maneuvers

    Raises:
        HTTPException: If routing fails or GraphHopper is unavailable
    """
    try:
        # Validate profile
        if request.profile not in ["car", "emergency"]:
            raise HTTPException(status_code=400, detail="Invalid profile. Use 'car' or 'emergency'")

        # Calculate route
        route = routing_service.get_route(
            origin=(request.origin_lat, request.origin_lng),
            destination=(request.destination_lat, request.destination_lng),
            profile=request.profile
        )

        return route

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Routing error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Routing service unavailable. Ensure GraphHopper is running."
        )


@router.get("/health")
async def routing_health():
    """
    Check routing service health.

    Returns:
        dict: Health status
    """
    is_healthy = routing_service.check_health()

    return {
        "routing_available": is_healthy,
        "graphhopper_url": routing_service.base_url,
        "status": "healthy" if is_healthy else "unavailable"
    }


@router.get("/profiles")
async def get_profiles():
    """
    Get available routing profiles.

    Returns:
        dict: Available routing profiles
    """
    return {
        "profiles": [
            {
                "name": "car",
                "description": "Standard car routing",
                "use_case": "General navigation"
            },
            {
                "name": "emergency",
                "description": "Emergency vehicle routing with priority on major roads",
                "use_case": "EMS response routing"
            }
        ]
    }
