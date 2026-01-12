/**
 * API Client for communicating with Python FastAPI backend
 */
import axios, { AxiosInstance } from 'axios';

// Declare electron API interface
declare global {
  interface Window {
    electronAPI?: {
      apiPort: number | null;
      getApiPort: () => Promise<number>;
      onApiPortReady: (callback: (port: number) => void) => void;
    };
  }
}

/**
 * Get API base URL
 * In Electron: Use port provided by main process
 * In development: Use localhost:8000
 */
function getAPIBaseURL(): string {
  // Check if running in Electron
  if (window.electronAPI?.apiPort) {
    return `http://127.0.0.1:${window.electronAPI.apiPort}`;
  }

  // Fallback to default port for development
  return 'http://127.0.0.1:8000';
}

/**
 * Create axios instance
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: getAPIBaseURL(),
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Update API base URL when Electron provides port
 */
export function updateAPIBaseURL(port: number): void {
  apiClient.defaults.baseURL = `http://127.0.0.1:${port}`;
  console.log(`API client updated to use port ${port}`);
}

/**
 * Initialize API client in Electron context
 */
export async function initializeAPIClient(): Promise<void> {
  if (window.electronAPI) {
    try {
      // Try to get port immediately
      const port = await window.electronAPI.getApiPort();
      if (port) {
        updateAPIBaseURL(port);
      }
    } catch (error) {
      console.warn('Failed to get API port immediately, waiting for ready event');
    }

    // Also listen for port ready event
    window.electronAPI.onApiPortReady((port) => {
      updateAPIBaseURL(port);
    });
  }
}

// API endpoint functions

/**
 * Health check
 */
export async function checkHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}

/**
 * Get feature flags
 */
export async function getFeatures() {
  const response = await apiClient.get('/api/features');
  return response.data;
}

/**
 * Get stations
 */
export async function getStations() {
  const response = await apiClient.get('/api/stations');
  return response.data;
}

/**
 * Get beats
 */
export async function getBeats(stationId?: number) {
  const params = stationId ? { station_id: stationId } : {};
  const response = await apiClient.get('/api/beats', { params });
  return response.data;
}

/**
 * Get facilities
 */
export async function getFacilities(filters?: {
  type?: string;
  station_id?: number;
  capability?: string;
}) {
  const response = await apiClient.get('/api/facilities', { params: filters });
  return response.data;
}

export default apiClient;
