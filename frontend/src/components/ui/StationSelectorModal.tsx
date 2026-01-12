/**
 * Station Selection Modal
 * Allows users to select their "home" station for station-centric features
 */
import { useState, useMemo, useEffect } from 'react';
import { useStationStore, Station } from '../../store/stationStore';
import { apiClient } from '../../api/client';

interface StationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStation: (station: Station | null) => void;
}

// Group stations by type for display
function groupStationsByType(stations: Station[]) {
  const groups: Record<string, Station[]> = {
    volunteer: [],
    career: [],
    federal: [],
    rescue: [],
  };

  stations.forEach((station) => {
    const type = station.station_type?.toLowerCase() || 'volunteer';
    if (groups[type]) {
      groups[type].push(station);
    } else {
      groups.volunteer.push(station);
    }
  });

  // Sort each group by station number
  Object.keys(groups).forEach((key) => {
    groups[key].sort((a, b) => {
      // Extract numeric portion for sorting
      const aNum = parseInt(a.station_number.replace(/\D/g, '')) || 999;
      const bNum = parseInt(b.station_number.replace(/\D/g, '')) || 999;
      return aNum - bNum;
    });
  });

  return groups;
}

function StationSelectorModal({
  isOpen,
  onClose,
  onSelectStation,
}: StationSelectorModalProps) {
  const { selectedStation, stations, setStations } = useStationStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch stations on mount if not already loaded
  useEffect(() => {
    if (stations.length === 0 && isOpen) {
      fetchStations();
    }
  }, [isOpen, stations.length]);

  const fetchStations = async () => {
    setLoading(true);
    setError(null);
    try {
      const cacheBuster = `?_t=${Date.now()}`;
      const response = await apiClient.get(`/api/facilities/stations${cacheBuster}`);
      const features = response.data.features || [];

      // Convert GeoJSON features to Station objects
      const stationList: Station[] = features.map((f: any) => ({
        id: f.properties.id,
        station_number: f.properties.station_number,
        station_name: f.properties.station_name,
        address: f.properties.address,
        city: f.properties.city,
        zip_code: f.properties.zip_code,
        station_type: f.properties.station_type,
        coordinates: f.geometry.coordinates as [number, number],
        apparatus: f.properties.apparatus,
      }));

      setStations(stationList);
    } catch (err: any) {
      setError('Failed to load stations');
      console.error('Error loading stations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter stations by search term
  const filteredStations = useMemo(() => {
    if (!searchTerm) return stations;
    const term = searchTerm.toLowerCase();
    return stations.filter(
      (s) =>
        s.station_number.toLowerCase().includes(term) ||
        s.station_name.toLowerCase().includes(term) ||
        s.city.toLowerCase().includes(term)
    );
  }, [stations, searchTerm]);

  // Group filtered stations
  const groupedStations = useMemo(
    () => groupStationsByType(filteredStations),
    [filteredStations]
  );

  const handleSelectStation = (station: Station) => {
    onSelectStation(station);
    onClose();
  };

  const handleClearSelection = () => {
    onSelectStation(null);
    onClose();
  };

  if (!isOpen) return null;

  const typeLabels: Record<string, string> = {
    volunteer: 'Volunteer Stations',
    career: 'Career Stations',
    federal: 'Federal Stations',
    rescue: 'Rescue Squads',
  };

  const typeColors: Record<string, string> = {
    volunteer: 'bg-amber-500',
    career: 'bg-red-600',
    federal: 'bg-blue-700',
    rescue: 'bg-purple-600',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Select Your Home Station</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search by station number, name, or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading stations...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-red-500">{error}</div>
            </div>
          ) : (
            <div className="space-y-6">
              {['volunteer', 'career', 'federal', 'rescue'].map((type) => {
                const typeStations = groupedStations[type];
                if (typeStations.length === 0) return null;

                return (
                  <div key={type}>
                    <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                      {typeLabels[type]} ({typeStations.length})
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {typeStations.map((station) => {
                        const isSelected = selectedStation?.station_number === station.station_number;
                        return (
                          <button
                            key={station.station_number}
                            onClick={() => handleSelectStation(station)}
                            className={`text-left p-3 rounded-lg border-2 transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-white text-xs font-bold px-2 py-1 rounded ${typeColors[type]}`}
                              >
                                {station.station_number}
                              </span>
                              {isSelected && (
                                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </div>
                            <div className="mt-1 text-sm font-medium text-gray-800 truncate">
                              {station.station_name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{station.city}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <div className="flex items-center justify-between">
            <button
              onClick={handleClearSelection}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
            >
              Clear Selection (View All County)
            </button>
            <div className="text-sm text-gray-500">
              {selectedStation ? (
                <span>
                  Current: <strong>Station {selectedStation.station_number}</strong>
                </span>
              ) : (
                <span>No station selected</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StationSelectorModal;
