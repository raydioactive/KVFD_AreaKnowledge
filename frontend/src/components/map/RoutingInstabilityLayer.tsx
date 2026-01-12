import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';
import { useStationStore } from '../../store/stationStore';

interface RoutingInstabilityLayerProps {
  map: maplibregl.Map | null;
  visible: boolean;
}

interface InstabilityData {
  type: 'FeatureCollection';
  properties: {
    station_pattern: string;
    total_instabilities: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
  };
  features: any[];
}

function RoutingInstabilityLayer({ map, visible }: RoutingInstabilityLayerProps) {
  const [data, setData] = useState<InstabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getFirstDueBoxPattern } = useStationStore();
  const stationPattern = getFirstDueBoxPattern();

  // Fetch instability data
  useEffect(() => {
    if (!stationPattern) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(`/api/gis/routing-instabilities/${stationPattern}`);
        setData(response.data);
        console.log(`Loaded ${response.data.features?.length || 0} instability features`);
      } catch (err: any) {
        // File might not exist yet
        if (err.response?.status === 404) {
          setError('No instability data. Run: python scripts/find_routing_instabilities.py --station ' + stationPattern);
        } else {
          setError('Failed to load instability data');
        }
        console.warn('Instability data not available:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stationPattern]);

  // Add/remove layers
  useEffect(() => {
    if (!map || !data) return;

    const addLayers = () => {
      if (!map.isStyleLoaded()) return;

      // Remove existing layers
      const layerIds = [
        'instability-lines',
        'instability-points-critical',
        'instability-points-high',
        'instability-points-medium'
      ];

      for (const id of layerIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource('routing-instabilities')) {
        map.removeSource('routing-instabilities');
      }

      if (!visible) return;

      // Add source
      map.addSource('routing-instabilities', {
        type: 'geojson',
        data: data
      });

      // Add lines connecting instability pairs
      map.addLayer({
        id: 'instability-lines',
        type: 'line',
        source: 'routing-instabilities',
        filter: ['==', ['get', 'type'], 'instability_zone'],
        paint: {
          'line-color': [
            'match',
            ['get', 'severity'],
            'critical', '#dc2626',
            'high', '#f97316',
            'medium', '#eab308',
            '#gray'
          ],
          'line-width': 3,
          'line-dasharray': [2, 1]
        }
      });

      // Add point markers - Critical (red)
      map.addLayer({
        id: 'instability-points-critical',
        type: 'circle',
        source: 'routing-instabilities',
        filter: [
          'all',
          ['==', ['get', 'type'], 'instability_address'],
          ['==', ['get', 'severity'], 'critical']
        ],
        paint: {
          'circle-radius': 8,
          'circle-color': '#dc2626',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });

      // Add point markers - High (orange)
      map.addLayer({
        id: 'instability-points-high',
        type: 'circle',
        source: 'routing-instabilities',
        filter: [
          'all',
          ['==', ['get', 'type'], 'instability_address'],
          ['==', ['get', 'severity'], 'high']
        ],
        paint: {
          'circle-radius': 6,
          'circle-color': '#f97316',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2
        }
      });

      // Add point markers - Medium (yellow)
      map.addLayer({
        id: 'instability-points-medium',
        type: 'circle',
        source: 'routing-instabilities',
        filter: [
          'all',
          ['==', ['get', 'type'], 'instability_address'],
          ['==', ['get', 'severity'], 'medium']
        ],
        paint: {
          'circle-radius': 5,
          'circle-color': '#eab308',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1
        }
      });

      console.log('Routing instability layers added');
    };

    addLayers();

    // Re-add on style changes
    const onStyleData = () => {
      setTimeout(() => {
        if (!map.getSource('routing-instabilities')) {
          addLayers();
        }
      }, 100);
    };

    map.on('styledata', onStyleData);

    return () => {
      map.off('styledata', onStyleData);

      const layerIds = [
        'instability-lines',
        'instability-points-critical',
        'instability-points-high',
        'instability-points-medium'
      ];

      for (const id of layerIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource('routing-instabilities')) {
        map.removeSource('routing-instabilities');
      }
    };
  }, [map, data, visible]);

  // Add click handler for popups
  useEffect(() => {
    if (!map || !visible || !data) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['instability-points-critical', 'instability-points-high', 'instability-points-medium']
      });

      if (features.length > 0) {
        const feature = features[0];
        const props = feature.properties;

        const severity = props.severity?.toUpperCase() || 'UNKNOWN';
        const severityColor = props.severity === 'critical' ? '#dc2626' :
                              props.severity === 'high' ? '#f97316' : '#eab308';

        const routeRoads = props.route_roads ?
          (typeof props.route_roads === 'string' ? JSON.parse(props.route_roads) : props.route_roads).join(' > ') :
          'Unknown';

        const content = `
          <div style="padding: 8px; max-width: 300px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="background: ${severityColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">
                ${severity}
              </span>
              ${props.has_uturn ? '<span style="background: #7c3aed; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">U-TURN</span>' : ''}
            </div>
            <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 13px;">${props.address || 'Unknown'}</p>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">
              <strong>Route:</strong> ${routeRoads}
            </p>
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">
              <strong>Distance:</strong> ${Math.round(props.route_distance || 0)}m
            </p>
            <p style="margin: 0; font-size: 11px; color: #888; font-style: italic;">
              ${props.reason || ''}
            </p>
          </div>
        `;

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(content)
          .addTo(map);
      }
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const layers = ['instability-points-critical', 'instability-points-high', 'instability-points-medium'];
    for (const layer of layers) {
      map.on('click', layer, onClick);
      map.on('mouseenter', layer, onMouseEnter);
      map.on('mouseleave', layer, onMouseLeave);
    }

    return () => {
      for (const layer of layers) {
        map.off('click', layer, onClick);
        map.off('mouseenter', layer, onMouseEnter);
        map.off('mouseleave', layer, onMouseLeave);
      }
    };
  }, [map, visible, data]);

  // Show loading/error status
  if (loading || error) {
    return (
      <div className="absolute top-24 right-4 bg-white rounded-lg shadow-lg p-3 max-w-sm z-10">
        {loading && (
          <p className="text-sm text-blue-600">Loading routing instabilities...</p>
        )}
        {error && (
          <div className="text-sm">
            <p className="text-orange-600 font-semibold mb-1">Routing Instability Data</p>
            <p className="text-gray-600 text-xs">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Show summary when visible and data loaded
  if (visible && data && data.properties) {
    const { critical_count, high_count, medium_count } = data.properties;

    return (
      <div className="absolute top-24 right-4 bg-white rounded-lg shadow-lg p-3 z-10">
        <p className="text-sm font-semibold mb-2">Routing Instabilities</p>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-600"></span>
            {critical_count} critical
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            {high_count} high
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            {medium_count} medium
          </span>
        </div>
      </div>
    );
  }

  return null;
}

export default RoutingInstabilityLayer;
