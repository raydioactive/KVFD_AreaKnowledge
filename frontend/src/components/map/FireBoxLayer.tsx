import { useEffect, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';
import union from '@turf/union';
import { polygon, multiPolygon, featureCollection } from '@turf/helpers';

interface FireBoxLayerProps {
  map: maplibregl.Map | null;
  visible: boolean;
  stationPattern: string | null;  // e.g., "05" for station 5
  onDataLoaded?: (data: FireBoxData | null) => void;
  viewMode?: 'detailed' | 'outline';  // 'detailed' shows all boxes, 'outline' shows only first-due border
  disablePopups?: boolean;  // Disable click popups (e.g., during quiz mode)
}

interface FireBoxFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    [key: string]: any;
  };
}

export interface FireBoxData {
  type: 'FeatureCollection';
  features: FireBoxFeature[];
}

function FireBoxLayer({ map, visible, stationPattern, onDataLoaded, viewMode = 'detailed', disablePopups = false }: FireBoxLayerProps) {
  const [fireBoxData, setFireBoxData] = useState<FireBoxData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergedOutline, setMergedOutline] = useState<any>(null);
  const [lastMergePattern, setLastMergePattern] = useState<string | null>(null);

  // Fetch fire box data on mount
  useEffect(() => {
    console.log('FireBoxLayer mounted, fetching fire box data...');

    const fetchFireBoxes = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('Fetching from /api/gis/fire-boxes...');
        const response = await apiClient.get('/api/gis/fire-boxes');
        const data = response.data;

        // Validate data
        if (!data || !data.features || !Array.isArray(data.features)) {
          throw new Error('Invalid GeoJSON response');
        }

        // Count valid polygons
        const validPolygons = data.features.filter(
          (f: any) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        ).length;

        console.log(`✓ Loaded ${data.features.length} fire box features`);
        console.log(`  Valid polygons: ${validPolygons}`);

        if (validPolygons < 400) {
          console.warn(`⚠️  WARNING: Expected ~450+ fire boxes, found only ${validPolygons}`);
        }

        setFireBoxData(data);
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || 'Failed to load fire box data';
        setError(errorMsg);
        console.error('Fire box load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFireBoxes();
  }, []); // Only fetch once on mount

  // Notify parent when data changes
  useEffect(() => {
    onDataLoaded?.(fireBoxData);
  }, [fireBoxData, onDataLoaded]);

  // Pre-compute merged outline when station pattern changes
  useEffect(() => {
    if (!fireBoxData || !stationPattern) {
      setMergedOutline(null);
      setLastMergePattern(null);
      return;
    }

    // Skip if already computed for this pattern
    if (lastMergePattern === stationPattern && mergedOutline) {
      return;
    }

    console.log('Computing merged outline for station pattern:', stationPattern);

    const firstDueFeatures = fireBoxData.features.filter((f: any) =>
      f.properties?.BEAT?.startsWith(stationPattern)
    );

    if (firstDueFeatures.length === 0) {
      setMergedOutline(null);
      setLastMergePattern(stationPattern);
      return;
    }

    try {
      let merged: any = null;

      for (const feature of firstDueFeatures) {
        if (!feature.geometry) continue;

        let currentPoly: any;
        if (feature.geometry.type === 'Polygon') {
          currentPoly = polygon(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'MultiPolygon') {
          currentPoly = multiPolygon(feature.geometry.coordinates);
        } else {
          continue;
        }

        if (!merged) {
          merged = currentPoly;
        } else {
          try {
            merged = union(featureCollection([merged, currentPoly]));
          } catch (e) {
            console.warn('Union failed for polygon, skipping:', e);
          }
        }
      }

      if (merged) {
        setMergedOutline({
          type: 'FeatureCollection',
          features: [merged]
        });
        console.log('Merged outline computed successfully');
      }
      setLastMergePattern(stationPattern);
    } catch (e) {
      console.error('Error computing merged outline:', e);
      setMergedOutline(null);
      setLastMergePattern(stationPattern);
    }
  }, [fireBoxData, stationPattern]);

  // Add/remove layer when data or visibility changes
  useEffect(() => {
    console.log('FireBoxLayer effect triggered:', { map: !!map, fireBoxData: !!fireBoxData, visible, stationPattern, viewMode });

    if (!map || !fireBoxData) {
      console.log('Skipping layer update - map or data not ready');
      return;
    }

    let isActive = true;  // Track if effect is still active

    const updateLayer = () => {
      if (!isActive) return;

      // Remove existing layers and source if they exist
      try {
        if (map.getLayer('fire-boxes-fill')) {
          map.removeLayer('fire-boxes-fill');
        }
        if (map.getLayer('fire-boxes-outline')) {
          map.removeLayer('fire-boxes-outline');
        }
        if (map.getSource('fire-boxes')) {
          map.removeSource('fire-boxes');
        }
      } catch (e) {
        console.warn('Error removing existing fire box layers:', e);
      }

      // If visible, add the layer
      if (visible) {
        try {
          // In outline mode, use pre-computed merged outline
          let dataToRender: any = fireBoxData;
          if (viewMode === 'outline' && stationPattern) {
            if (mergedOutline) {
              // Use the pre-computed merged outline
              dataToRender = mergedOutline;
            } else {
              // No merged outline yet, show empty while computing
              dataToRender = { type: 'FeatureCollection', features: [] };
            }
          }

          // Add source
          console.log(`Adding fire-boxes source with ${dataToRender.features?.length || 0} features (viewMode: ${viewMode})`);
          map.addSource('fire-boxes', {
            type: 'geojson',
            data: dataToRender
          });

          // Build style expressions based on view mode and station
          let fillColor: any;
          let fillOpacity: any;
          let lineColor: any;
          let lineWidth: any;

          if (viewMode === 'outline') {
            // Outline mode: very subtle fill, prominent border for first-due only
            fillColor = '#ff0000';
            fillOpacity = 0.1;  // Very subtle fill
            lineColor = '#cc0000';
            lineWidth = 4;
          } else {
            // Detailed mode: show all boxes with first-due highlighted
            fillColor = stationPattern
              ? [
                  'case',
                  ['==', ['slice', ['get', 'BEAT'], 0, 2], stationPattern],
                  '#ff0000',  // Bright RED for first-due
                  '#0066ff',  // Bright BLUE for others
                ]
              : '#ff0000';

            fillOpacity = stationPattern
              ? [
                  'case',
                  ['==', ['slice', ['get', 'BEAT'], 0, 2], stationPattern],
                  0.5,  // More opaque for first-due
                  0.3,  // Less opaque for others
                ]
              : 0.4;

            lineColor = stationPattern
              ? [
                  'case',
                  ['==', ['slice', ['get', 'BEAT'], 0, 2], stationPattern],
                  '#cc0000',  // Dark red for first-due
                  '#0044cc',  // Dark blue for others
                ]
              : '#cc0000';

            lineWidth = stationPattern
              ? [
                  'case',
                  ['==', ['slice', ['get', 'BEAT'], 0, 2], stationPattern],
                  4,  // Thicker for first-due
                  2,  // Thinner for others
                ]
              : 3;
          }

          // Add fill layer (semi-transparent)
          map.addLayer({
            id: 'fire-boxes-fill',
            type: 'fill',
            source: 'fire-boxes',
            paint: {
              'fill-color': fillColor as any,
              'fill-opacity': fillOpacity as any
            }
          });

          // Add outline layer
          map.addLayer({
            id: 'fire-boxes-outline',
            type: 'line',
            source: 'fire-boxes',
            paint: {
              'line-color': lineColor as any,
              'line-width': lineWidth as any,
              'line-opacity': 0.8
            }
          });

          // Verify layers were added
          const fillExists = map.getLayer('fire-boxes-fill');
          const outlineExists = map.getLayer('fire-boxes-outline');
          const sourceExists = map.getSource('fire-boxes');
          console.log(`Fire box layer added - pattern: ${stationPattern || 'none'}, fill: ${!!fillExists}, outline: ${!!outlineExists}, source: ${!!sourceExists}`);
        } catch (err) {
          console.error('Error adding fire box layer:', err);
        }
      }
    };

    // Function to check style and add layer
    const tryAddLayer = () => {
      if (!isActive) return;

      if (map.isStyleLoaded()) {
        console.log('Style loaded, adding fire box layer...');
        updateLayer();
      } else {
        console.log('Style not loaded yet, waiting...');
      }
    };

    // If style is already loaded, update immediately
    tryAddLayer();

    // Listen for style load event (fires when style is fully loaded)
    const onStyleLoad = () => {
      console.log('Style load event fired');
      tryAddLayer();
    };

    // Listen for style changes (when user toggles map mode)
    // Only re-add if the source was removed (style change clears sources)
    const onStyleData = () => {
      // Small delay to ensure style is fully applied
      setTimeout(() => {
        if (isActive && !map.getSource('fire-boxes')) {
          tryAddLayer();
        }
      }, 100);
    };

    map.on('load', onStyleLoad);
    map.on('styledata', onStyleData);

    // Cleanup
    return () => {
      console.log('FireBoxLayer cleanup running');
      isActive = false;
      map.off('load', onStyleLoad);
      map.off('styledata', onStyleData);

      // Remove layers
      if (map && map.getStyle()) {
        try {
          const hadFill = !!map.getLayer('fire-boxes-fill');
          const hadOutline = !!map.getLayer('fire-boxes-outline');
          if (map.getLayer('fire-boxes-fill')) {
            map.removeLayer('fire-boxes-fill');
          }
          if (map.getLayer('fire-boxes-outline')) {
            map.removeLayer('fire-boxes-outline');
          }
          if (map.getSource('fire-boxes')) {
            map.removeSource('fire-boxes');
          }
          console.log(`FireBoxLayer cleanup removed: fill=${hadFill}, outline=${hadOutline}`);
        } catch (e) {
          console.warn('Error removing fire box layer:', e);
        }
      }
    };
  }, [map, fireBoxData, visible, stationPattern, viewMode, mergedOutline]);

  // Add click handler for popups
  useEffect(() => {
    if (!map || !visible || !fireBoxData || disablePopups) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['fire-boxes-fill']
      });

      if (features.length > 0) {
        const feature = features[0];
        const props = feature.properties;

        // Create popup content
        let content = '<div style="padding: 8px;"><h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold;">Fire Box</h3>';

        // Display all properties
        for (const [key, value] of Object.entries(props || {})) {
          if (value !== null && value !== undefined) {
            content += `<p style="margin: 4px 0; font-size: 12px;"><strong>${key}:</strong> ${value}</p>`;
          }
        }

        content += '</div>';

        // Show popup
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(content)
          .addTo(map);
      }
    };

    // Change cursor on hover
    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'fire-boxes-fill', onClick);
    map.on('mouseenter', 'fire-boxes-fill', onMouseEnter);
    map.on('mouseleave', 'fire-boxes-fill', onMouseLeave);

    return () => {
      map.off('click', 'fire-boxes-fill', onClick);
      map.off('mouseenter', 'fire-boxes-fill', onMouseEnter);
      map.off('mouseleave', 'fire-boxes-fill', onMouseLeave);
    };
  }, [map, visible, fireBoxData, disablePopups]);

  // Show loading/error/status UI
  if (loading || error) {
    return (
      <div className="absolute top-24 left-4 bg-white rounded-lg shadow-lg p-3 max-w-sm z-10">
        {loading && (
          <p className="text-sm text-blue-600">Loading fire boxes...</p>
        )}
        {error && (
          <div className="text-sm">
            <p className="text-red-600 font-semibold mb-1">Fire Box Data Unavailable</p>
            <p className="text-gray-600 text-xs">{error}</p>
            <p className="text-gray-600 text-xs mt-2">
              Run: <code className="bg-gray-100 px-1">python scripts/download_fire_boxes.py</code>
            </p>
          </div>
        )}
      </div>
    );
  }

  // Component doesn't render visible UI (just manages map layer)
  return null;
}

export default FireBoxLayer;
