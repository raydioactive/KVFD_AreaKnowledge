import { useState, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';

interface RoutingTestPanelProps {
  map: maplibregl.Map | null;
  onRouteCalculated: (route: any) => void;
}

function RoutingTestPanel({ map, onRouteCalculated }: RoutingTestPanelProps) {
  const [mode, setMode] = useState<'select-origin' | 'select-destination' | 'idle'>('idle');
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle map clicks for selecting points
  const handleMapClick = (e: maplibregl.MapMouseEvent) => {
    const { lat, lng } = e.lngLat;

    if (mode === 'select-origin') {
      setOrigin([lat, lng]);
      setMode('select-destination');
      addMarker(map!, lat, lng, 'A', 'green');
    } else if (mode === 'select-destination') {
      setDestination([lat, lng]);
      setMode('idle');
      addMarker(map!, lat, lng, 'B', 'red');
    }
  };

  // Set up click handler when mode changes
  useEffect(() => {
    if (!map) return;

    if (mode !== 'idle') {
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', handleMapClick);
    } else {
      map.getCanvas().style.cursor = '';
      map.off('click', handleMapClick);
    }

    return () => {
      map.off('click', handleMapClick);
      map.getCanvas().style.cursor = '';
    };
  }, [map, mode]);

  const calculateRoute = async () => {
    if (!origin || !destination) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/routing/route', {
        origin_lat: origin[0],
        origin_lng: origin[1],
        destination_lat: destination[0],
        destination_lng: destination[1],
        profile: 'car'
      });

      onRouteCalculated(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to calculate route');
      console.error('Routing error:', err);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setOrigin(null);
    setDestination(null);
    setMode('idle');
    setError(null);
    clearMarkers(map!);
    onRouteCalculated(null);
  };

  return (
    <div className="absolute bottom-20 left-4 bg-white rounded-lg shadow-lg p-4 w-80 z-10">
      <h3 className="text-lg font-bold text-gray-800 mb-3">Routing Test</h3>

      {/* Instructions */}
      <div className="mb-4">
        {mode === 'idle' && (
          <p className="text-sm text-gray-600">
            Click "Start" to test routing by selecting two points on the map.
          </p>
        )}
        {mode === 'select-origin' && (
          <p className="text-sm text-blue-600 font-semibold">
            Click on the map to select the origin (Point A)
          </p>
        )}
        {mode === 'select-destination' && (
          <p className="text-sm text-blue-600 font-semibold">
            Click on the map to select the destination (Point B)
          </p>
        )}
      </div>

      {/* Selected points */}
      {(origin || destination) && (
        <div className="mb-4 space-y-2 text-sm">
          {origin && (
            <div className="flex items-center gap-2">
              <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold">A</span>
              <span className="text-gray-700">
                {origin[0].toFixed(4)}, {origin[1].toFixed(4)}
              </span>
            </div>
          )}
          {destination && (
            <div className="flex items-center gap-2">
              <span className="bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold">B</span>
              <span className="text-gray-700">
                {destination[0].toFixed(4)}, {destination[1].toFixed(4)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {mode === 'idle' && !origin && (
          <button
            onClick={() => setMode('select-origin')}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            Start
          </button>
        )}

        {origin && destination && mode === 'idle' && (
          <button
            onClick={calculateRoute}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium disabled:opacity-50"
          >
            {loading ? 'Calculating...' : 'Calculate Route'}
          </button>
        )}

        {(origin || destination || mode !== 'idle') && (
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 font-medium"
          >
            Reset
          </button>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Phase 2 Testing: GraphHopper routing with turn-by-turn directions
        </p>
      </div>
    </div>
  );
}

// Helper to add marker
function addMarker(map: maplibregl.Map, lat: number, lng: number, label: string, color: string) {
  const el = document.createElement('div');
  el.className = 'marker';
  el.style.backgroundColor = color;
  el.style.width = '30px';
  el.style.height = '30px';
  el.style.borderRadius = '50%';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.color = 'white';
  el.style.fontWeight = 'bold';
  el.style.fontSize = '16px';
  el.style.border = '2px solid white';
  el.textContent = label;

  new maplibregl.Marker(el)
    .setLngLat([lng, lat])
    .addTo(map);
}

// Helper to clear all markers
function clearMarkers(_map: maplibregl.Map) {
  const markers = document.querySelectorAll('.marker');
  markers.forEach(marker => {
    const parent = marker.parentElement;
    if (parent) {
      parent.remove();
    }
  });
}

export default RoutingTestPanel;