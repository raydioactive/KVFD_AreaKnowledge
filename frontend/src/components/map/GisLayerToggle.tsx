interface GisLayerToggleProps {
  showFireBoxes: boolean;
  onChange: (show: boolean) => void;
}

function GisLayerToggle({ showFireBoxes, onChange }: GisLayerToggleProps) {
  return (
    <div className="absolute top-32 right-4 bg-white rounded-lg shadow-lg p-2 z-10">
      <button
        onClick={() => onChange(!showFireBoxes)}
        className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
          showFireBoxes
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
        title={showFireBoxes ? 'Hide fire boxes' : 'Show fire boxes'}
      >
        {/* Fire box icon */}
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>

        <span className="text-sm font-medium">
          {showFireBoxes ? 'Hide' : 'Show'} Fire Boxes
        </span>

        {/* Status indicator */}
        {showFireBoxes && (
          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>
    </div>
  );
}

export default GisLayerToggle;
