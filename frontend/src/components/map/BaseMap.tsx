import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FeatureFlags } from '../../config/features';
import RouteLayer from './RouteLayer';
import RoutingTestPanel from './RoutingTestPanel';
import FireBoxLayer from './FireBoxLayer';
import RoutingInstabilityLayer from './RoutingInstabilityLayer';
import FacilityMarkers from './FacilityMarkers';
import Toolbar from '../ui/Toolbar';
import LayersPanel, { LayerConfig } from '../ui/LayersPanel';
import QuizPanel from '../quiz/QuizPanel';
import AddressQuiz from '../quiz/AddressQuiz';
import Dashboard from '../dashboard/Dashboard';
import StationSelectorModal from '../ui/StationSelectorModal';
import { useStationStore, Station } from '../../store/stationStore';

interface BaseMapProps {
  features: FeatureFlags;
}

function BaseMap({ features }: BaseMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapMode, setMapMode] = useState<'training' | 'reference'>(features.defaultMapMode);
  const [route, setRoute] = useState<any>(null);
  const [showFireBoxes, setShowFireBoxes] = useState<boolean>(features.defaultShowFireBoxes);
  const [showHospitals, setShowHospitals] = useState<boolean>(false);
  const [showStations, setShowStations] = useState<boolean>(false);
  const [showNursingHomes, setShowNursingHomes] = useState<boolean>(false);
  const [layersPanelOpen, setLayersPanelOpen] = useState<boolean>(false);
  const [quizPanelOpen, setQuizPanelOpen] = useState<boolean>(false);
  const [dashboardOpen, setDashboardOpen] = useState<boolean>(false);
  const [routingPanelOpen, setRoutingPanelOpen] = useState<boolean>(false);
  const [fireBoxData, setFireBoxData] = useState<any>(null);
  const [fireBoxViewMode, setFireBoxViewMode] = useState<'detailed' | 'outline'>('detailed');
  const [addressQuizOpen, setAddressQuizOpen] = useState<boolean>(false);
  const [showRoutingInstabilities, setShowRoutingInstabilities] = useState<boolean>(false);

  // Station store
  const {
    selectedStation,
    isStationModalOpen,
    setSelectedStation,
    closeStationModal,
    openStationModal,
    getFirstDueBoxPattern,
    _hasHydrated,
  } = useStationStore();

  const stationPattern = getFirstDueBoxPattern();

  // GIS Layer configurations
  const [layers, setLayers] = useState<LayerConfig[]>([
    {
      id: 'fire-boxes',
      name: 'Fire Boxes',
      visible: features.defaultShowFireBoxes,
      available: features.enableFireBoxLayer,
      description: 'Fire box boundaries for Montgomery County',
      icon: '🔥',
    },
    {
      id: 'fire-stations',
      name: 'Fire Stations',
      visible: false,
      available: true,
      description: 'Fire station locations with apparatus info',
      icon: '🚒',
    },
    {
      id: 'hospitals',
      name: 'Hospitals',
      visible: false,
      available: true,
      description: 'Hospital locations with capabilities (trauma, STEMI, stroke)',
      icon: '🏥',
    },
    {
      id: 'nursing-homes',
      name: 'Nursing Homes',
      visible: false,
      available: true,
      description: 'Long-term care facilities',
      icon: '🏘️',
    },
    {
      id: 'beat-boundaries',
      name: 'Beat Boundaries',
      visible: false,
      available: false,
      description: 'EMS beat coverage areas (coming soon)',
      icon: '🗺️',
    },
    {
      id: 'routing-instabilities',
      name: 'Routing Hazards',
      visible: false,
      available: true,
      description: 'Locations where GPS routing may be unreliable',
      icon: '⚠️',
    },
  ]);

  // Montgomery County, MD coordinates (approximate center)
  const MOCO_CENTER: [number, number] = [-77.1528, 39.1434];
  const INITIAL_ZOOM = 10;

  // Recenter map to selected station's first-due area
  const recenterToStation = useCallback(() => {
    if (!map.current) return;

    if (selectedStation && stationPattern && fireBoxData) {
      // Find all fire boxes that belong to this station
      const firstDueBoxes = fireBoxData.features?.filter((f: any) =>
        f.properties.BEAT?.startsWith(stationPattern)
      ) || [];

      if (firstDueBoxes.length > 0) {
        // Calculate bounding box of all first-due boxes
        const bounds = new maplibregl.LngLatBounds();

        firstDueBoxes.forEach((box: any) => {
          if (box.geometry.type === 'Polygon') {
            box.geometry.coordinates[0].forEach((coord: [number, number]) => {
              bounds.extend(coord);
            });
          } else if (box.geometry.type === 'MultiPolygon') {
            box.geometry.coordinates.forEach((polygon: any) => {
              polygon[0].forEach((coord: [number, number]) => {
                bounds.extend(coord);
              });
            });
          }
        });

        map.current.fitBounds(bounds, {
          padding: 50,
          maxZoom: 13,
          duration: 1000,
        });
        return;
      }
    }

    // Fallback: center on county
    map.current.flyTo({
      center: MOCO_CENTER,
      zoom: INITIAL_ZOOM,
      duration: 1000,
    });
  }, [selectedStation, stationPattern, fireBoxData]);

  // Handle station selection
  const handleStationSelect = useCallback((station: Station | null) => {
    setSelectedStation(station);
    // Auto-enable fire boxes when station is selected
    if (station) {
      setShowFireBoxes(true);
      setLayers((prevLayers) =>
        prevLayers.map((layer) =>
          layer.id === 'fire-boxes' ? { ...layer, visible: true } : layer
        )
      );
    }
  }, [setSelectedStation]);

  // Auto-recenter when station changes and fire box data is loaded
  useEffect(() => {
    if (selectedStation && fireBoxData && map.current) {
      recenterToStation();
    }
  }, [selectedStation, fireBoxData, recenterToStation]);

  // Show station modal on first launch if no station selected
  // Also auto-enable fire boxes if station was restored from storage
  // Wait for Zustand hydration before making decisions
  useEffect(() => {
    if (!_hasHydrated) return; // Wait for localStorage hydration

    if (!selectedStation) {
      openStationModal();
    } else {
      // Station was restored from localStorage - enable fire boxes
      if (!showFireBoxes) {
        setShowFireBoxes(true);
        setLayers((prevLayers) =>
          prevLayers.map((layer) =>
            layer.id === 'fire-boxes' ? { ...layer, visible: true } : layer
          )
        );
      }
    }
  }, [_hasHydrated]); // Run when hydration completes

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Determine initial style based on mode
    const getStyleUrl = () => {
      // Get API base URL
      const apiBaseUrl = window.electronAPI?.apiPort
        ? `http://127.0.0.1:${window.electronAPI.apiPort}`
        : 'http://127.0.0.1:8000';

      // Return the appropriate style file URL
      const styleFile = mapMode === 'training' ? 'training-mode.json' : 'reference-mode.json';
      return `${apiBaseUrl}/styles/${styleFile}`;
    };

    // Initialize map
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: getStyleUrl(),
      center: MOCO_CENTER,
      zoom: INITIAL_ZOOM
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add scale control
    map.current.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    // Set map ready when loaded
    map.current.on('load', () => {
      console.log('Map loaded successfully');
      setMapReady(true);
    });

    // Cleanup
    return () => {
      setMapReady(false);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Handle map mode changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    console.log(`Map mode changed to: ${mapMode}`);

    // Get API base URL
    const apiBaseUrl = window.electronAPI?.apiPort
      ? `http://127.0.0.1:${window.electronAPI.apiPort}`
      : 'http://127.0.0.1:8000';

    // Load the appropriate style
    const styleFile = mapMode === 'training' ? 'training-mode.json' : 'reference-mode.json';
    const styleUrl = `${apiBaseUrl}/styles/${styleFile}`;

    // Change map style
    map.current.setStyle(styleUrl);

    console.log(`Loaded style: ${styleUrl}`);
  }, [mapMode]);

  const handleModeChange = (newMode: 'training' | 'reference') => {
    setMapMode(newMode);
    // Save preference to localStorage
    localStorage.setItem('mapMode', newMode);
  };

  const handleLayerToggle = (layerId: string, visible: boolean) => {
    setLayers((prevLayers) =>
      prevLayers.map((layer) =>
        layer.id === layerId ? { ...layer, visible } : layer
      )
    );

    // Keep layer state in sync
    switch (layerId) {
      case 'fire-boxes':
        setShowFireBoxes(visible);
        break;
      case 'hospitals':
        setShowHospitals(visible);
        break;
      case 'fire-stations':
        setShowStations(visible);
        break;
      case 'nursing-homes':
        setShowNursingHomes(visible);
        break;
      case 'routing-instabilities':
        setShowRoutingInstabilities(visible);
        break;
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <Toolbar
        mapMode={mapMode}
        onMapModeChange={handleModeChange}
        showFireBoxes={showFireBoxes}
        onToggleFireBoxes={() => handleLayerToggle('fire-boxes', !showFireBoxes)}
        onStartQuiz={() => setQuizPanelOpen(true)}
        onStartAddressQuiz={() => setAddressQuizOpen(true)}
        onShowDashboard={() => setDashboardOpen(true)}
        onRecenter={recenterToStation}
        onOpenLayers={() => setLayersPanelOpen(true)}
        selectedStationNumber={selectedStation?.station_number || null}
        fireBoxViewMode={fireBoxViewMode}
        onToggleFireBoxViewMode={() => setFireBoxViewMode(fireBoxViewMode === 'detailed' ? 'outline' : 'detailed')}
      />

      {/* Layers Panel */}
      <LayersPanel
        isOpen={layersPanelOpen}
        onClose={() => setLayersPanelOpen(false)}
        layers={layers}
        onLayerToggle={handleLayerToggle}
      />

      {/* Map container */}
      <div className="relative flex-1">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Fire box layer */}
        {features.enableFireBoxLayer && mapReady && (
          <FireBoxLayer
            map={map.current}
            visible={showFireBoxes}
            stationPattern={stationPattern}
            onDataLoaded={setFireBoxData}
            viewMode={fireBoxViewMode}
            disablePopups={addressQuizOpen}
          />
        )}

        {/* Routing instability layer */}
        {mapReady && (
          <RoutingInstabilityLayer
            map={map.current}
            visible={showRoutingInstabilities}
          />
        )}

        {/* Facility markers (hospitals, stations, nursing homes) */}
        {mapReady && (
          <FacilityMarkers
            map={map.current}
            showHospitals={showHospitals}
            showStations={showStations}
            showNursingHomes={showNursingHomes}
          />
        )}

        {/* Route display */}
        <RouteLayer map={map.current} route={route} onClearRoute={() => setRoute(null)} />

        {/* Routing test panel */}
        {features.enableRouting && routingPanelOpen && (
          <RoutingTestPanel map={map.current} onRouteCalculated={setRoute} />
        )}

        {/* Quiz panel */}
        <QuizPanel
          map={map.current}
          isOpen={quizPanelOpen}
          onClose={() => setQuizPanelOpen(false)}
        />

        {/* Address Quiz */}
        <AddressQuiz
          map={map.current}
          isOpen={addressQuizOpen}
          onClose={() => setAddressQuizOpen(false)}
        />

        {/* Dashboard */}
        <Dashboard
          isOpen={dashboardOpen}
          onClose={() => setDashboardOpen(false)}
        />
      </div>

      {/* Station Selection Modal */}
      <StationSelectorModal
        isOpen={isStationModalOpen}
        onClose={closeStationModal}
        onSelectStation={handleStationSelect}
      />
    </div>
  );
}

export default BaseMap;
