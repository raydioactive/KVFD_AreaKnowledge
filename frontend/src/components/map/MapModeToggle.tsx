interface MapModeToggleProps {
  mode: 'training' | 'reference';
  onChange: (mode: 'training' | 'reference') => void;
}

function MapModeToggle({ mode, onChange }: MapModeToggleProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-2 border border-gray-200">
      <div className="text-xs font-semibold text-gray-600 mb-2 px-2">Map Mode</div>
      <div className="flex rounded-md overflow-hidden">
        {/* Training Mode Button */}
        <button
          onClick={() => onChange('training')}
          className={`
            px-4 py-2 text-sm font-medium transition-colors
            ${mode === 'training'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
          title="Training Mode - No street labels (forces geographic memory)"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Training
          </div>
        </button>

        {/* Reference Mode Button */}
        <button
          onClick={() => onChange('reference')}
          className={`
            px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300
            ${mode === 'reference'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
          `}
          title="Reference Mode - With street labels (study mode)"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Reference
          </div>
        </button>
      </div>

      {/* Mode description */}
      <div className="mt-2 px-2 text-xs text-gray-500">
        {mode === 'training' && (
          <p>No street names visible - test your knowledge</p>
        )}
        {mode === 'reference' && (
          <p>Street names visible - study and review</p>
        )}
      </div>
    </div>
  );
}

export default MapModeToggle;
