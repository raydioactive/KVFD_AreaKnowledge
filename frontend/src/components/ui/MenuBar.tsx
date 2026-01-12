import { useState, useRef, useEffect } from 'react';
import { useStationStore } from '../../store/stationStore';

interface MenuItem {
  label?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
}

interface MenuBarProps {
  onNewSession?: () => void;
  onLoadData?: () => void;
  onExport?: () => void;
  onExit?: () => void;
  mapMode: 'training' | 'reference';
  onMapModeChange?: (mode: 'training' | 'reference') => void;
  showFireBoxes: boolean;
  onToggleFireBoxes?: () => void;
  onShowLayers?: () => void;
  onRoutingTest?: () => void;
  onMeasure?: () => void;
  onSearch?: () => void;
  onAbout?: () => void;
  onHelp?: () => void;
  onStartQuiz?: () => void;
  onShowDashboard?: () => void;
}

function MenuBar({
  onNewSession,
  onLoadData,
  onExport,
  onExit,
  mapMode,
  onMapModeChange,
  showFireBoxes,
  onToggleFireBoxes,
  onShowLayers,
  onRoutingTest,
  onMeasure,
  onSearch,
  onAbout,
  onHelp,
  onStartQuiz,
  onShowDashboard,
}: MenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeMenu]);

  const handleMenuClick = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  const handleItemClick = (action?: () => void) => {
    if (action) {
      action();
    }
    setActiveMenu(null);
  };

  const fileMenu: MenuItem[] = [
    { label: 'New Session', action: onNewSession },
    { label: 'Load Data', action: onLoadData },
    { separator: true },
    { label: 'Export...', action: onExport, disabled: true },
    { separator: true },
    { label: 'Exit', action: onExit },
  ];

  const viewMenu: MenuItem[] = [
    {
      label: '✓ Training Mode (No Labels)',
      action: () => onMapModeChange?.('training'),
      checked: mapMode === 'training',
    },
    {
      label: '✓ Reference Mode (With Labels)',
      action: () => onMapModeChange?.('reference'),
      checked: mapMode === 'reference',
    },
    { separator: true },
    {
      label: 'Layers...',
      action: onShowLayers,
    },
    { separator: true },
    {
      label: `${showFireBoxes ? '✓' : '  '} Show Fire Boxes`,
      action: onToggleFireBoxes,
    },
    {
      label: '   Show Stations',
      disabled: true,
    },
    { separator: true },
    {
      label: 'Zoom to Area...',
      disabled: true,
    },
  ];

  const toolsMenu: MenuItem[] = [
    { label: 'Routing Test', action: onRoutingTest },
    { label: 'Measure Distance', action: onMeasure, disabled: true },
    { label: 'Search Address', action: onSearch, disabled: true },
  ];

  const trainingMenu: MenuItem[] = [
    { label: 'Start Quiz', action: onStartQuiz },
    { separator: true },
    { label: 'Dashboard', action: onShowDashboard },
    { separator: true },
    { label: 'Beat Identification', action: onStartQuiz },
    { label: 'Facility Location', action: onStartQuiz },
    { label: 'Protocol Destination', action: onStartQuiz },
    { label: 'Turn-by-Turn', action: onStartQuiz },
  ];

  const helpMenu: MenuItem[] = [
    { label: 'About MoCo EMS Trainer', action: onAbout },
    { label: 'Documentation', action: onHelp },
  ];

  const renderMenu = (items: MenuItem[]) => (
    <div className="absolute left-0 top-full mt-1 bg-white border border-gray-300 shadow-lg rounded min-w-[200px] py-1 z-50">
      {items.map((item, index) => {
        if (item.separator) {
          return <hr key={index} className="my-1 border-gray-200" />;
        }

        return (
          <button
            key={index}
            onClick={() => handleItemClick(item.action)}
            disabled={item.disabled}
            className={`w-full text-left px-4 py-2 text-sm ${
              item.disabled
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-800 hover:bg-blue-50 cursor-pointer'
            } ${item.checked && !item.disabled ? 'font-semibold' : ''}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={menuRef}
      className="flex items-center bg-gray-50 border-b border-gray-300 h-8 px-2 text-sm select-none"
    >
      {/* File Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('file')}
          className={`px-3 py-1 rounded ${
            activeMenu === 'file'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          File
        </button>
        {activeMenu === 'file' && renderMenu(fileMenu)}
      </div>

      {/* View Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('view')}
          className={`px-3 py-1 rounded ${
            activeMenu === 'view'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          View
        </button>
        {activeMenu === 'view' && renderMenu(viewMenu)}
      </div>

      {/* Tools Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('tools')}
          className={`px-3 py-1 rounded ${
            activeMenu === 'tools'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Tools
        </button>
        {activeMenu === 'tools' && renderMenu(toolsMenu)}
      </div>

      {/* Training Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('training')}
          className={`px-3 py-1 rounded ${
            activeMenu === 'training'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Training
        </button>
        {activeMenu === 'training' && renderMenu(trainingMenu)}
      </div>

      {/* Help Menu */}
      <div className="relative">
        <button
          onClick={() => handleMenuClick('help')}
          className={`px-3 py-1 rounded ${
            activeMenu === 'help'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-200'
          }`}
        >
          Help
        </button>
        {activeMenu === 'help' && renderMenu(helpMenu)}
      </div>

      {/* Station selector and App title (right side) */}
      <div className="ml-auto flex items-center gap-3">
        <StationSelector />
        <div className="text-gray-600 font-semibold text-xs">
          MoCo EMS Trainer
        </div>
      </div>
    </div>
  );
}

/**
 * Station selector button that shows current station and opens modal
 */
function StationSelector() {
  const { selectedStation, openStationModal, getStationDisplayNumber } = useStationStore();
  const displayNumber = getStationDisplayNumber();

  return (
    <button
      onClick={openStationModal}
      className="flex items-center gap-2 px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors"
      title={selectedStation ? `Change station (${selectedStation.station_name})` : 'Select your home station'}
    >
      {selectedStation ? (
        <>
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-bold text-gray-800">Station {displayNumber}</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs text-gray-500">Select Station</span>
        </>
      )}
    </button>
  );
}

export default MenuBar;
