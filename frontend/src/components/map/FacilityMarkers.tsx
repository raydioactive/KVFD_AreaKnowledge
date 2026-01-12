import { useEffect, useState, useCallback, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { apiClient } from '../../api/client';

interface FacilityMarkersProps {
  map: maplibregl.Map | null;
  showHospitals: boolean;
  showStations: boolean;
  showNursingHomes: boolean;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

// SVG Icons for facilities
const HOSPITAL_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#1e40af" stroke="white" stroke-width="2"/>
  <path d="M8 12h8M12 8v8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`;

const STATION_ICON_CAREER = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#dc2626" stroke="white" stroke-width="2"/>
  <path d="M12 5l-6 8h4v6h4v-6h4z" fill="white"/>
</svg>
`;

const STATION_ICON_VOLUNTEER = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#f59e0b" stroke="white" stroke-width="2"/>
  <path d="M12 5l-6 8h4v6h4v-6h4z" fill="white"/>
</svg>
`;

const STATION_ICON_COMBINATION = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#7c3aed" stroke="white" stroke-width="2"/>
  <path d="M12 5l-6 8h4v6h4v-6h4z" fill="white"/>
</svg>
`;

const NURSING_HOME_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="11" fill="#7c3aed" stroke="white" stroke-width="2"/>
  <path d="M7 17v-4c0-2.8 2.2-5 5-5s5 2.2 5 5v4" stroke="white" stroke-width="2" fill="none"/>
  <circle cx="12" cy="7" r="2" fill="white"/>
</svg>
`;

function FacilityMarkers({
  map,
  showHospitals,
  showStations,
  showNursingHomes
}: FacilityMarkersProps) {
  const [hospitals, setHospitals] = useState<GeoJSONFeatureCollection | null>(null);
  const [stations, setStations] = useState<GeoJSONFeatureCollection | null>(null);
  const [nursingHomes, setNursingHomes] = useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs to track markers
  const hospitalMarkersRef = useRef<maplibregl.Marker[]>([]);
  const stationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const nursingHomeMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Fetch all facility data on mount
  useEffect(() => {
    const fetchFacilities = async () => {
      setLoading('Loading facilities...');
      setError(null);

      try {
        // Add cache-busting parameter to force fresh data
        const cacheBuster = `?_t=${Date.now()}`;
        const [hospitalsRes, stationsRes, nursingHomesRes] = await Promise.all([
          apiClient.get(`/api/facilities/hospitals${cacheBuster}`),
          apiClient.get(`/api/facilities/stations${cacheBuster}`),
          apiClient.get(`/api/facilities/nursing-homes${cacheBuster}`)
        ]);

        setHospitals(hospitalsRes.data);
        setStations(stationsRes.data);
        setNursingHomes(nursingHomesRes.data);

        console.log(`Loaded facilities: ${hospitalsRes.data.features.length} hospitals, ` +
          `${stationsRes.data.features.length} stations, ${nursingHomesRes.data.features.length} nursing homes`);
      } catch (err: any) {
        const errorMsg = err.response?.data?.detail || 'Failed to load facility data';
        setError(errorMsg);
        console.error('Facility load error:', err);
      } finally {
        setLoading(null);
      }
    };

    fetchFacilities();
  }, []);

  // Helper to create popup content for hospitals
  const createHospitalPopup = useCallback((props: any) => {
    const capabilities = [];
    if (props.is_trauma_center) capabilities.push(`Trauma Level ${props.trauma_level}`);
    if (props.is_stemi_center) capabilities.push('STEMI');
    if (props.is_stroke_center) capabilities.push(`Stroke (${props.stroke_level})`);
    if (props.is_burn_center) capabilities.push('Burn');
    if (props.is_pediatric_center) capabilities.push('Pediatric');

    return `
      <div style="padding: 8px; min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #1e40af;">
          ${props.name}
        </h3>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.address}</p>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.city}, ${props.state} ${props.zip_code}</p>
        ${capabilities.length > 0 ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
            <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: bold; color: #333;">Capabilities:</p>
            <p style="margin: 0; font-size: 11px; color: #059669;">${capabilities.join(' | ')}</p>
          </div>
        ` : ''}
        ${props.has_helipad ? '<p style="margin: 4px 0; font-size: 11px; color: #7c3aed;">Helipad Available</p>' : ''}
      </div>
    `;
  }, []);

  // Helper to create popup content for stations
  const createStationPopup = useCallback((props: any) => {
    let apparatus = props.apparatus || [];
    // Parse if it's a string (from JSON)
    if (typeof apparatus === 'string') {
      try {
        apparatus = JSON.parse(apparatus);
      } catch {
        apparatus = [];
      }
    }

    return `
      <div style="padding: 8px; min-width: 180px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #dc2626;">
          Station ${props.station_number}
        </h3>
        <p style="margin: 4px 0; font-size: 13px; font-weight: 500;">${props.station_name}</p>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.address}</p>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.city}, MD ${props.zip_code}</p>
        <p style="margin: 8px 0 4px 0; font-size: 11px;">
          <span style="background: ${props.station_type === 'career' ? '#059669' : props.station_type === 'volunteer' ? '#d97706' : '#7c3aed'};
                       color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">
            ${props.station_type.toUpperCase()}
          </span>
        </p>
        ${apparatus.length > 0 ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
            <p style="margin: 0 0 4px 0; font-size: 11px; font-weight: bold;">Apparatus:</p>
            <p style="margin: 0; font-size: 11px; color: #666;">${apparatus.join(', ')}</p>
          </div>
        ` : ''}
      </div>
    `;
  }, []);

  // Helper to create popup content for nursing homes
  const createNursingHomePopup = useCallback((props: any) => {
    const stars = props.cms_rating ? '★'.repeat(props.cms_rating) + '☆'.repeat(5 - props.cms_rating) : 'N/A';
    return `
      <div style="padding: 8px; min-width: 180px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #7c3aed;">
          ${props.name}
        </h3>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.address}</p>
        <p style="margin: 4px 0; font-size: 12px; color: #666;">${props.city}, ${props.state} ${props.zip_code}</p>
        <p style="margin: 8px 0 4px 0; font-size: 11px;">
          <span style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 10px;">
            ${props.facility_type.replace('_', ' ').toUpperCase()}
          </span>
        </p>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
          <p style="margin: 0 0 4px 0; font-size: 11px;">
            <strong>Beds:</strong> ${props.bed_count || 'N/A'}
          </p>
          <p style="margin: 0; font-size: 11px;">
            <strong>CMS Rating:</strong> <span style="color: #f59e0b;">${stars}</span>
          </p>
        </div>
      </div>
    `;
  }, []);

  // Create a marker element with icon and label
  const createMarkerElement = useCallback((
    svgIcon: string,
    label: string,
    labelColor: string,
    size: number = 28
  ): HTMLElement => {
    const container = document.createElement('div');
    container.className = 'facility-marker';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      transform: translate(-50%, -100%);
    `;

    // Icon container
    const iconWrapper = document.createElement('div');
    iconWrapper.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    `;
    iconWrapper.innerHTML = svgIcon;
    container.appendChild(iconWrapper);

    // Label
    const labelEl = document.createElement('div');
    labelEl.style.cssText = `
      background: white;
      color: ${labelColor};
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      margin-top: 2px;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    labelEl.textContent = label;
    container.appendChild(labelEl);

    return container;
  }, []);

  // Clear markers helper
  const clearMarkers = useCallback((markersRef: React.MutableRefObject<maplibregl.Marker[]>) => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // Manage hospital markers
  useEffect(() => {
    if (!map || !hospitals) return;

    // Clear existing markers
    clearMarkers(hospitalMarkersRef);

    if (showHospitals) {
      hospitals.features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        const el = createMarkerElement(
          HOSPITAL_ICON,
          props.short_name || props.name,
          '#1e40af',
          28
        );

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(coords)
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: true })
              .setHTML(createHospitalPopup(props))
          )
          .addTo(map);

        hospitalMarkersRef.current.push(marker);
      });

      console.log(`Added ${hospitals.features.length} hospital markers`);
    }

    return () => {
      clearMarkers(hospitalMarkersRef);
    };
  }, [map, hospitals, showHospitals, createMarkerElement, createHospitalPopup, clearMarkers]);

  // Manage station markers
  useEffect(() => {
    if (!map || !stations) return;

    // Clear existing markers
    clearMarkers(stationMarkersRef);

    if (showStations) {
      stations.features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        // Select icon based on station type
        let icon = STATION_ICON_CAREER;
        if (props.station_type === 'volunteer') {
          icon = STATION_ICON_VOLUNTEER;
        } else if (props.station_type === 'combination') {
          icon = STATION_ICON_COMBINATION;
        }

        const el = createMarkerElement(
          icon,
          `Sta ${props.station_number}`,
          props.station_type === 'career' ? '#dc2626' :
          props.station_type === 'volunteer' ? '#f59e0b' : '#7c3aed',
          28
        );

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(coords)
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: true })
              .setHTML(createStationPopup(props))
          )
          .addTo(map);

        stationMarkersRef.current.push(marker);
      });

      console.log(`Added ${stations.features.length} station markers`);
    }

    return () => {
      clearMarkers(stationMarkersRef);
    };
  }, [map, stations, showStations, createMarkerElement, createStationPopup, clearMarkers]);

  // Manage nursing home markers
  useEffect(() => {
    if (!map || !nursingHomes) return;

    // Clear existing markers
    clearMarkers(nursingHomeMarkersRef);

    if (showNursingHomes) {
      nursingHomes.features.forEach(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        const el = createMarkerElement(
          NURSING_HOME_ICON,
          props.short_name || props.name,
          '#7c3aed',
          24
        );

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(coords)
          .setPopup(
            new maplibregl.Popup({ offset: 25, closeButton: true })
              .setHTML(createNursingHomePopup(props))
          )
          .addTo(map);

        nursingHomeMarkersRef.current.push(marker);
      });

      console.log(`Added ${nursingHomes.features.length} nursing home markers`);
    }

    return () => {
      clearMarkers(nursingHomeMarkersRef);
    };
  }, [map, nursingHomes, showNursingHomes, createMarkerElement, createNursingHomePopup, clearMarkers]);

  // Show loading/error state
  if (loading || error) {
    return (
      <div className="absolute top-24 right-4 bg-white rounded-lg shadow-lg p-3 max-w-sm z-10">
        {loading && <p className="text-sm text-blue-600">{loading}</p>}
        {error && (
          <div className="text-sm">
            <p className="text-red-600 font-semibold mb-1">Facility Data Error</p>
            <p className="text-gray-600 text-xs">{error}</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default FacilityMarkers;
