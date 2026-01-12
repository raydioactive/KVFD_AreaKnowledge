/**
 * Feature flags interface - matches backend configuration
 */
export interface FeatureFlags {
  // Map features
  enableStreetLabelsToggle: boolean;
  defaultMapMode: 'training' | 'reference';
  enableGisLayers: boolean;
  enableFireBoxLayer: boolean;
  defaultShowFireBoxes: boolean;

  // Quiz modes
  quizBeatIdentification: boolean;
  quizFacilityLocation: boolean;
  quizProtocolDestination: boolean;
  quizTurnByTurn: boolean;

  // Data sources
  enableMocoGisSync: boolean;
  enableOsmSupplement: boolean;
  enableHhsNursingHomes: boolean;

  // Advanced features
  enableSpacedRepetition: boolean;
  enableProtocolEngine: boolean;
  enableRouting: boolean;

  // UI features
  enableDarkMode: boolean;
  enableDashboard: boolean;
  enableProgressTracking: boolean;
}

/**
 * Default feature flags (fallback if API fails)
 */
export const defaultFeatures: FeatureFlags = {
  enableStreetLabelsToggle: true,
  defaultMapMode: 'training',
  enableGisLayers: true,
  enableFireBoxLayer: true,
  defaultShowFireBoxes: false,
  quizBeatIdentification: true,
  quizFacilityLocation: true,
  quizProtocolDestination: true,
  quizTurnByTurn: true,
  enableMocoGisSync: true,
  enableOsmSupplement: true,
  enableHhsNursingHomes: true,
  enableSpacedRepetition: true,
  enableProtocolEngine: true,
  enableRouting: true,
  enableDarkMode: false,
  enableDashboard: true,
  enableProgressTracking: true,
};

/**
 * Convert snake_case backend keys to camelCase frontend keys
 */
function convertToCamelCase(obj: any): FeatureFlags {
  return {
    enableStreetLabelsToggle: obj.enable_street_labels_toggle,
    defaultMapMode: obj.default_map_mode,
    enableGisLayers: obj.enable_gis_layers,
    enableFireBoxLayer: obj.enable_fire_box_layer,
    defaultShowFireBoxes: obj.default_show_fire_boxes,
    quizBeatIdentification: obj.quiz_beat_identification,
    quizFacilityLocation: obj.quiz_facility_location,
    quizProtocolDestination: obj.quiz_protocol_destination,
    quizTurnByTurn: obj.quiz_turn_by_turn,
    enableMocoGisSync: obj.enable_moco_gis_sync,
    enableOsmSupplement: obj.enable_osm_supplement,
    enableHhsNursingHomes: obj.enable_hhs_nursing_homes,
    enableSpacedRepetition: obj.enable_spaced_repetition,
    enableProtocolEngine: obj.enable_protocol_engine,
    enableRouting: obj.enable_routing,
    enableDarkMode: obj.enable_dark_mode,
    enableDashboard: obj.enable_dashboard,
    enableProgressTracking: obj.enable_progress_tracking,
  };
}

/**
 * Fetch feature flags from backend API
 */
export async function fetchFeatures(apiBaseUrl: string): Promise<FeatureFlags> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/features`);
    if (!response.ok) {
      console.warn('Failed to fetch features, using defaults');
      return defaultFeatures;
    }
    const data = await response.json();
    return convertToCamelCase(data);
  } catch (error) {
    console.error('Error fetching features:', error);
    return defaultFeatures;
  }
}
