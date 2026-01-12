import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

interface Maneuver {
  instruction: string;
  distance_meters: number;
  distance_miles: number;
  duration_seconds: number;
  street_name?: string;
  type?: string;
}

interface RouteData {
  geometry: [number, number][];  // [[lng, lat], ...]
  duration_minutes: number;
  distance_km: number;
  distance_miles: number;
  maneuvers: Maneuver[];
  profile: string;
}

interface RouteLayerProps {
  map: maplibregl.Map | null;
  route: RouteData | null;
  onClearRoute?: () => void;
}

function RouteLayer({ map, route, onClearRoute }: RouteLayerProps) {
  useEffect(() => {
    if (!map) return;

    let isActive = true;  // Track if this effect is still active

    // Function to add/remove route based on current state
    const updateRoute = () => {
      if (!isActive) return;  // Don't update if effect has been cleaned up
      
      if (route) {
        addRouteToMap(map, route);
      } else {
        removeRouteFromMap(map);
      }
    };

    // If style is already loaded, update immediately
    if (map.isStyleLoaded()) {
      updateRoute();
    }

    // Listen for style changes (when user toggles map mode)
    const onStyleData = () => {
      if (isActive && map.isStyleLoaded()) {
        updateRoute();
      }
    };
    
    map.on('styledata', onStyleData);

    // Cleanup
    return () => {
      isActive = false;  // Mark effect as inactive
      map.off('styledata', onStyleData);  // Remove listener FIRST
      
      // Then remove route layers
      if (map && map.getStyle()) {
        try {
          removeRouteFromMap(map);
        } catch (e) {
          console.warn('Error removing route:', e);
        }
      }
    };
  }, [map, route]);

  if (!route) return null;

  return (
    <div className="absolute top-20 left-4 bg-white rounded-lg shadow-lg p-4 max-w-sm z-10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">Route</h3>
        {onClearRoute && (
          <button
            onClick={onClearRoute}
            className="text-gray-500 hover:text-gray-700"
            title="Clear route"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Route summary */}
      <div className="bg-blue-50 rounded p-3 mb-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-600">Distance</p>
            <p className="font-semibold text-gray-800">{route.distance_miles} mi</p>
          </div>
          <div>
            <p className="text-gray-600">Duration</p>
            <p className="font-semibold text-gray-800">{route.duration_minutes} min</p>
          </div>
        </div>
      </div>

      {/* Turn-by-turn directions */}
      {route.maneuvers && route.maneuvers.length > 0 && (
        <div className="max-h-64 overflow-y-auto">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Directions</h4>
          <ol className="space-y-2">
            {route.maneuvers.map((maneuver, index) => (
              <li key={index} className="flex gap-2 text-sm">
                <span className="font-semibold text-blue-600 min-w-[20px]">{index + 1}.</span>
                <div className="flex-1">
                  <p className="text-gray-800">{maneuver.instruction}</p>
                  {maneuver.street_name && (
                    <p className="text-gray-600 text-xs mt-0.5">{maneuver.street_name}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-0.5">
                    {maneuver.distance_miles.toFixed(1)} mi
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Helper function to add route to map
function addRouteToMap(map: maplibregl.Map, route: RouteData) {
  try {
    // Remove existing route if any
    removeRouteFromMap(map);

    // Convert geometry to GeoJSON LineString
    const geojson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: route.geometry  // Already [lng, lat] from backend
      }
    };

    // Add source
    map.addSource('route', {
      type: 'geojson',
      data: geojson
    });

    // Add route outline layer (bottom)
    map.addLayer({
      id: 'route-outline',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': '#1e40af',
        'line-width': 8,
        'line-opacity': 0.4
      }
    });

    // Add route line layer (top)
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      paint: {
        'line-color': '#3b82f6',
        'line-width': 6,
        'line-opacity': 0.8
      }
    });

    // Fit map to route bounds
    const coordinates = geojson.geometry.coordinates;
    if (coordinates.length > 0) {
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number])
      );

      map.fitBounds(bounds, {
        padding: { top: 100, bottom: 100, left: 400, right: 100 }
      });
    }
  } catch (error) {
    console.error('Error adding route to map:', error);
  }
}

// Helper function to remove route from map
function removeRouteFromMap(map: maplibregl.Map) {
  try {
    // Only proceed if map has a loaded style
    if (!map || !map.getStyle()) {
      return;
    }

    // Remove layers in reverse order (line first, then outline)
    const layersToRemove = ['route-line', 'route-outline'];
    layersToRemove.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    // Remove source last
    if (map.getSource('route')) {
      map.removeSource('route');
    }
  } catch (error) {
    console.error('Error removing route:', error);
  }
}

export default RouteLayer;