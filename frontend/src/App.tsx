import { useEffect, useState } from 'react';
import { initializeAPIClient } from './api/client';
import { fetchFeatures, FeatureFlags, defaultFeatures } from './config/features';
import HomePage from './pages/HomePage';

function App() {
  const [features, setFeatures] = useState<FeatureFlags>(defaultFeatures);
  const [apiReady, setApiReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        // Initialize API client (get port from Electron)
        await initializeAPIClient();

        // Wait a moment for backend to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Fetch feature flags from backend
        const apiBaseUrl = window.electronAPI?.apiPort
          ? `http://127.0.0.1:${window.electronAPI.apiPort}`
          : 'http://127.0.0.1:8000';

        const loadedFeatures = await fetchFeatures(apiBaseUrl);
        setFeatures(loadedFeatures);
        setApiReady(true);

        console.log('App initialized with features:', loadedFeatures);
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setError('Failed to connect to backend. Please restart the application.');
        // Use default features as fallback
        setApiReady(true);
      }
    }

    initialize();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!apiReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-700">Loading MoCo EMS Trainer...</p>
        </div>
      </div>
    );
  }

  return <HomePage features={features} />;
}

export default App;
