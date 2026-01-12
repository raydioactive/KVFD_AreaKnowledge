/**
 * Zustand store for station selection state
 * Manages the selected "home" station for station-centric features
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Station {
  id: number | string;
  station_number: string;
  station_name: string;
  address: string;
  city: string;
  zip_code: string;
  station_type: string;
  coordinates: [number, number];
  apparatus?: string[];
}

interface StationStore {
  // State
  selectedStation: Station | null;
  stations: Station[];
  isStationModalOpen: boolean;
  _hasHydrated: boolean;

  // Actions
  setSelectedStation: (station: Station | null) => void;
  setStations: (stations: Station[]) => void;
  openStationModal: () => void;
  closeStationModal: () => void;
  setHasHydrated: (hydrated: boolean) => void;

  // Computed helpers
  getFirstDueBoxPattern: () => string | null;
  getStationDisplayNumber: () => string | null;
}

/**
 * Convert station number to fire box BEAT pattern
 * Station "5" -> "05" (matches boxes 0501, 0502, etc.)
 * Station "21" -> "21" (matches boxes 2101, 2102, etc.)
 * Station "Rescue 1" -> null (rescue squads have no first-due boxes)
 */
function stationToBoxPattern(stationNumber: string): string | null {
  // Handle rescue squads - they serve county-wide, no first-due boxes
  if (stationNumber.toLowerCase().includes('rescue')) {
    return null;
  }

  // Extract numeric portion
  const numMatch = stationNumber.match(/^\d+$/);
  if (!numMatch) {
    return null;
  }

  const num = parseInt(stationNumber, 10);
  if (isNaN(num) || num <= 0) {
    return null;
  }

  // Pad to 2 digits: 5 -> "05", 21 -> "21"
  return num.toString().padStart(2, '0');
}

/**
 * Get display-friendly station number
 * "5" -> "5"
 * "Rescue 1" -> "R1"
 */
function getDisplayNumber(stationNumber: string): string {
  if (stationNumber.toLowerCase().includes('rescue')) {
    const num = stationNumber.match(/\d+/);
    return num ? `R${num[0]}` : stationNumber;
  }
  return stationNumber;
}

export const useStationStore = create<StationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedStation: null,
      stations: [],
      isStationModalOpen: false,
      _hasHydrated: false,

      // Actions
      setSelectedStation: (station) => set({ selectedStation: station }),

      setStations: (stations) => set({ stations }),

      openStationModal: () => set({ isStationModalOpen: true }),

      closeStationModal: () => set({ isStationModalOpen: false }),

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

      // Computed helpers
      getFirstDueBoxPattern: () => {
        const { selectedStation } = get();
        if (!selectedStation) return null;
        return stationToBoxPattern(selectedStation.station_number);
      },

      getStationDisplayNumber: () => {
        const { selectedStation } = get();
        if (!selectedStation) return null;
        return getDisplayNumber(selectedStation.station_number);
      },
    }),
    {
      name: 'moco-ems-station', // localStorage key
      partialize: (state) => ({
        // Only persist the selected station, not the full list or modal state
        selectedStation: state.selectedStation,
      }),
      onRehydrateStorage: () => (state) => {
        // Called when hydration is complete
        state?.setHasHydrated(true);
      },
    }
  )
);

// Export helper functions for use outside React components
export { stationToBoxPattern, getDisplayNumber };
