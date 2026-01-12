"""
Routing Service
Provides turn-by-turn routing using GraphHopper
"""
from typing import List, Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)


class RoutingService:
    """Routing service using GraphHopper via routingpy"""

    def __init__(self, base_url: str = "http://127.0.0.1:8989"):
        """
        Initialize routing service.

        Args:
            base_url: GraphHopper server URL
        """
        self.base_url = base_url
        self._client = None

    def _get_client(self):
        """Get or create routingpy client"""
        if self._client is None:
            try:
                from routingpy import Graphhopper
                self._client = Graphhopper(base_url=self.base_url)
                logger.info(f"GraphHopper client initialized: {self.base_url}")
            except ImportError:
                logger.error("routingpy not installed. Install with: pip install routingpy")
                raise
        return self._client

    def get_route(
        self,
        origin: Tuple[float, float],
        destination: Tuple[float, float],
        profile: str = "car"
    ) -> Dict[str, Any]:
        """
        Get a route from origin to destination.

        Args:
            origin: (latitude, longitude) tuple
            destination: (latitude, longitude) tuple
            profile: Routing profile ('car' or 'emergency')

        Returns:
            dict: Route information including geometry, duration, distance, and maneuvers
        """
        try:
            client = self._get_client()

            # routingpy expects (lng, lat) for GraphHopper, so swap coordinates
            origin_swapped = (origin[1], origin[0])  # (lng, lat)
            destination_swapped = (destination[1], destination[0])  # (lng, lat)

            # Request route
            route = client.directions(
                locations=[origin_swapped, destination_swapped],
                profile=profile,
                instructions=True,
                elevation=False,
                alternatives=False
            )

            # Parse response
            return {
                "geometry": self._decode_polyline(route.geometry),
                "duration_minutes": round(route.duration / 60, 1),
                "distance_km": round(route.distance / 1000, 2),
                "distance_miles": round(route.distance / 1609.34, 2),
                "maneuvers": self._parse_maneuvers(route),
                "profile": profile
            }

        except Exception as e:
            logger.error(f"Routing error: {e}")
            raise

    def _decode_polyline(self, encoded: str | List) -> List[Tuple[float, float]]:
        """
        Decode polyline geometry.

        Args:
            encoded: Encoded polyline string or list of coordinates

        Returns:
            List of (lng, lat) tuples for MapLibre
        """
        # routingpy returns list in (lng, lat) format - return as-is for MapLibre
        if isinstance(encoded, list):
            return encoded  # Already (lng, lat)

        # If it's still encoded, decode it
        return self._polyline_decode(encoded)

    def _polyline_decode(self, encoded: str, precision: int = 5) -> List[Tuple[float, float]]:
        """
        Decode a polyline string.

        Args:
            encoded: Encoded polyline string
            precision: Encoding precision

        Returns:
            List of (lng, lat) tuples
        """
        coordinates = []
        index = lat = lng = 0
        factor = 10 ** precision

        while index < len(encoded):
            # Decode latitude
            result = 1
            shift = 0
            while True:
                b = ord(encoded[index]) - 63 - 1
                index += 1
                result += b << shift
                shift += 5
                if b < 0x1f:
                    break
            lat += (~result >> 1) if (result & 1) != 0 else (result >> 1)

            # Decode longitude
            result = 1
            shift = 0
            while True:
                b = ord(encoded[index]) - 63 - 1
                index += 1
                result += b << shift
                shift += 5
                if b < 0x1f:
                    break
            lng += (~result >> 1) if (result & 1) != 0 else (result >> 1)

            # Return as (lng, lat) for MapLibre
            coordinates.append((lng / factor, lat / factor))

        return coordinates

    def _parse_maneuvers(self, route) -> List[Dict[str, Any]]:
        """
        Parse turn-by-turn maneuvers from route.

        Args:
            route: routingpy route object

        Returns:
            List of maneuver dictionaries
        """
        maneuvers = []

        if hasattr(route, 'directions') and route.directions:
            for step in route.directions:
                maneuver = {
                    "instruction": getattr(step, 'instruction', ''),
                    "distance_meters": getattr(step, 'distance', 0),
                    "distance_miles": round(getattr(step, 'distance', 0) / 1609.34, 2),
                    "duration_seconds": getattr(step, 'duration', 0),
                }

                # Add street name if available
                if hasattr(step, 'name'):
                    maneuver["street_name"] = step.name

                # Add turn direction if available
                if hasattr(step, 'type'):
                    maneuver["type"] = step.type

                maneuvers.append(maneuver)

        return maneuvers

    def check_health(self) -> bool:
        """
        Check if GraphHopper server is running.

        Returns:
            bool: True if server is healthy
        """
        try:
            import requests
            response = requests.get(f"{self.base_url}/health", timeout=2)
            return response.status_code == 200
        except Exception as e:
            logger.error(f"GraphHopper health check failed: {e}")
            return False


# Global routing service instance
routing_service = RoutingService()