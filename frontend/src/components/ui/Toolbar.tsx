interface ToolbarProps {
  mapMode: 'training' | 'reference';
  onMapModeChange: (mode: 'training' | 'reference') => void;
  showFireBoxes: boolean;
  onToggleFireBoxes: () => void;
  onStartQuiz?: () => void;
  onStartAddressQuiz?: () => void;
  onShowDashboard?: () => void;
  onRecenter?: () => void;
  onOpenLayers?: () => void;
  selectedStationNumber?: string | null;
  fireBoxViewMode?: 'detailed' | 'outline';
  onToggleFireBoxViewMode?: () => void;
}

function Toolbar({
  mapMode,
  onMapModeChange,
  showFireBoxes,
  onToggleFireBoxes,
  onStartQuiz,
  onStartAddressQuiz,
  onShowDashboard,
  onRecenter,
  onOpenLayers,
  selectedStationNumber,
  fireBoxViewMode = 'detailed',
  onToggleFireBoxViewMode,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-50 border-b border-gray-300 px-2 py-1">
      {/* Map Mode Toggle */}
      <div className="flex items-center border-r border-gray-300 pr-2 mr-1">
        <button
          onClick={() => onMapModeChange('training')}
          className={`p-2 rounded transition-colors ${
            mapMode === 'training'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
          title="Training Mode (No Labels)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>
        <button
          onClick={() => onMapModeChange('reference')}
          className={`p-2 rounded transition-colors ${
            mapMode === 'reference'
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
          title="Reference Mode (With Labels)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h.01M7 12h.01M7 16h.01"
            />
          </svg>
        </button>
      </div>

      {/* GIS Layers */}
      <div className="flex items-center border-r border-gray-300 pr-2 mr-1">
        <button
          onClick={onToggleFireBoxes}
          className={`p-2 rounded transition-colors ${
            showFireBoxes
              ? 'bg-red-500 text-white'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
          title={showFireBoxes ? 'Hide Fire Boxes' : 'Show Fire Boxes'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
        </button>
        {showFireBoxes && (
          <button
            onClick={onToggleFireBoxViewMode}
            className={`p-2 rounded transition-colors ${
              fireBoxViewMode === 'outline'
                ? 'bg-orange-500 text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
            title={fireBoxViewMode === 'outline' ? 'Show All Boxes (Detailed)' : 'Show Station Area Only (Outline)'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {fireBoxViewMode === 'outline' ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              )}
            </svg>
          </button>
        )}
        <button
          onClick={onRecenter}
          className="p-2 rounded text-gray-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
          title={selectedStationNumber ? `Recenter on Station ${selectedStationNumber}` : 'Recenter on County'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>
        <button
          onClick={onOpenLayers}
          className="p-2 rounded text-gray-600 hover:bg-purple-100 hover:text-purple-700 transition-colors"
          title="View Layers"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </button>
      </div>

      {/* Training Tools */}
      <div className="flex items-center border-r border-gray-300 pr-2 mr-1">
        <button
          onClick={onStartAddressQuiz}
          className="p-2 rounded text-gray-600 hover:bg-red-100 hover:text-red-700 transition-colors"
          title="Address Quiz - Find locations on the map"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        <button
          onClick={onStartQuiz}
          className="p-2 rounded text-gray-600 hover:bg-green-100 hover:text-green-700 transition-colors"
          title="Facility Quiz"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </button>
        <button
          onClick={onShowDashboard}
          className="p-2 rounded text-gray-600 hover:bg-blue-100 hover:text-blue-700 transition-colors"
          title="Dashboard"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </button>
      </div>

      {/* Mode indicator (text) */}
      <div className="flex items-center gap-2 text-xs text-gray-600 ml-2">
        <span className="font-medium">
          {mapMode === 'training' ? '🎓 Training Mode' : '📖 Reference Mode'}
        </span>
        {showFireBoxes && (
          <>
            <span className="text-gray-400">|</span>
            <span className="text-red-600 font-medium">
              🔥 {fireBoxViewMode === 'outline' ? 'Station Area' : 'All Boxes'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default Toolbar;
