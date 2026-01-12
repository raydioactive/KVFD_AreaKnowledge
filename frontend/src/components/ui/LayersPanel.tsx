import { useState, useRef, useEffect } from 'react';

export interface LayerConfig {
  id: string;
  name: string;
  visible: boolean;
  available: boolean;
  description?: string;
  icon?: string;
}

interface LayersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerConfig[];
  onLayerToggle: (layerId: string, visible: boolean) => void;
}

function LayersPanel({ isOpen, onClose, layers, onLayerToggle }: LayersPanelProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('drag-handle')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bg-white border border-gray-400 rounded-lg shadow-2xl z-50"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '320px',
        maxHeight: '500px',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Title bar (draggable) */}
      <div className="drag-handle flex items-center justify-between bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-t-lg cursor-move select-none">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
            />
          </svg>
          <h3 className="font-semibold text-sm">GIS Layers</h3>
        </div>
        <button
          onClick={onClose}
          className="hover:bg-blue-700 rounded p-1 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Layer list */}
      <div className="p-3 overflow-y-auto" style={{ maxHeight: '420px' }}>
        <p className="text-xs text-gray-600 mb-3">
          Toggle map layers on/off. Unavailable layers coming soon.
        </p>

        <div className="space-y-1">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`flex items-start gap-2 p-2 rounded transition-colors ${
                layer.available
                  ? 'hover:bg-gray-50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => {
                if (layer.available) {
                  onLayerToggle(layer.id, !layer.visible);
                }
              }}
            >
              {/* Checkbox */}
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={layer.visible}
                  disabled={!layer.available}
                  onChange={(e) => {
                    if (layer.available) {
                      onLayerToggle(layer.id, e.target.checked);
                    }
                  }}
                  className="w-4 h-4 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Icon (optional) */}
              {layer.icon && (
                <div className="text-lg flex-shrink-0">{layer.icon}</div>
              )}

              {/* Layer info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      layer.available ? 'text-gray-800' : 'text-gray-500'
                    }`}
                  >
                    {layer.name}
                  </span>
                  {!layer.available && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      Coming Soon
                    </span>
                  )}
                  {layer.available && layer.visible && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                      ON
                    </span>
                  )}
                </div>
                {layer.description && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {layer.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              {layers.filter((l) => l.visible).length} of{' '}
              {layers.filter((l) => l.available).length} layers active
            </span>
            <button
              onClick={() => {
                layers
                  .filter((l) => l.available)
                  .forEach((l) => onLayerToggle(l.id, false));
              }}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 rounded-b-lg border-t border-gray-200">
        <p className="text-xs text-gray-500 italic">
          Drag title bar to move • Click outside to close
        </p>
      </div>
    </div>
  );
}

export default LayersPanel;
