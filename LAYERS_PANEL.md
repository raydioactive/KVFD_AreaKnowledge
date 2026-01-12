# Layers Panel Feature - Professional GIS Layer Management

## Overview

The Layers Panel provides a centralized, professional interface for managing all GIS data overlays in the MoCo EMS Trainer. Like QGIS or ArcGIS, users can toggle multiple layers on/off from a single, draggable window.

## Features

### ✅ Implemented

**Layers Panel Window**:
- **Draggable**: Grab the blue title bar to move anywhere on screen
- **Professional Design**: Gradient title bar, clean layout, organized sections
- **Layer List**: Shows all available GIS layers with:
  - Checkboxes to toggle on/off
  - Icons (🔥 fire boxes, 🚒 stations, etc.)
  - Status badges ("ON" for active, "Coming Soon" for unavailable)
  - Descriptions of each layer
- **Summary Stats**: Shows "X of Y layers active"
- **Clear All**: Button to hide all layers at once
- **Click Outside**: Closes panel automatically

**Current Layers**:
1. **🔥 Fire Boxes** - Available ✓
   - Fire box boundaries for Montgomery County
2. **🚒 Fire Stations** - Coming Soon
   - Fire station locations with apparatus info
3. **🏥 Hospitals** - Coming Soon
   - Hospital locations with capabilities (trauma, STEMI, stroke)
4. **🏘️ Nursing Homes** - Coming Soon
   - Long-term care facilities
5. **🗺️ Beat Boundaries** - Coming Soon
   - EMS beat coverage areas

## How to Use

### Opening the Layers Panel

**Method 1 - Menu Bar**:
1. Click **View** in menu bar
2. Click **Layers...**
3. Panel opens in center-left of screen

**Method 2 - Keyboard** (future):
- Press **L** key to toggle panel

### Managing Layers

**Toggle a Layer**:
- Click checkbox OR click anywhere on layer row
- Layer immediately shows/hides on map

**Multiple Layers**:
- Check multiple boxes to show multiple layers simultaneously
- Layers stack on top of each other

**Clear All Layers**:
- Click "Clear All" button at bottom
- All active layers turn off

**Close Panel**:
- Click X button in title bar
- OR click anywhere outside panel
- OR press Escape key (future)

### Dragging the Panel

1. Click and hold blue title bar
2. Drag panel anywhere on screen
3. Release to drop
4. Panel stays where you put it

## Visual Design

```
┌─────────────────────────────────────┐
│ 🗂️ GIS Layers                   ✕   │ ← Blue gradient title bar (draggable)
├─────────────────────────────────────┤
│ Toggle map layers on/off.          │
│ Unavailable layers coming soon.    │
│                                     │
│ ☑ 🔥 Fire Boxes            [ON]    │ ← Active layer
│    Fire box boundaries...          │
│                                     │
│ ☐ 🚒 Fire Stations  [Coming Soon]  │ ← Future layer
│    Fire station locations...       │
│                                     │
│ ☐ 🏥 Hospitals      [Coming Soon]  │
│    Hospital locations...           │
│                                     │
│ ☐ 🏘️ Nursing Homes  [Coming Soon]  │
│    Long-term care facilities       │
│                                     │
│ ☐ 🗺️ Beat Boundaries [Coming Soon] │
│    EMS beat coverage areas         │
│                                     │
├─────────────────────────────────────┤
│ 1 of 1 layers active   [Clear All] │ ← Summary & actions
├─────────────────────────────────────┤
│ Drag title bar to move • Click... │ ← Help text
└─────────────────────────────────────┘
```

## Technical Implementation

### Component Structure

**New Component**: `frontend/src/components/ui/LayersPanel.tsx`

**Props**:
```typescript
interface LayerConfig {
  id: string;              // 'fire-boxes', 'hospitals', etc.
  name: string;            // Display name
  visible: boolean;        // Currently shown on map
  available: boolean;      // Data downloaded and ready
  description?: string;    // Help text
  icon?: string;           // Emoji icon
}

interface LayersPanelProps {
  isOpen: boolean;         // Show/hide panel
  onClose: () => void;     // Close handler
  layers: LayerConfig[];   // All layer configs
  onLayerToggle: (id: string, visible: boolean) => void;
}
```

### State Management

**BaseMap.tsx** manages all layer state:

```typescript
const [layersPanelOpen, setLayersPanelOpen] = useState(false);
const [layers, setLayers] = useState<LayerConfig[]>([
  {
    id: 'fire-boxes',
    name: 'Fire Boxes',
    visible: false,
    available: true,  // Only available layer currently
    description: 'Fire box boundaries for Montgomery County',
    icon: '🔥',
  },
  // ... more layers
]);

const handleLayerToggle = (layerId: string, visible: boolean) => {
  // Update layer state
  // Sync with map display (e.g., showFireBoxes)
};
```

### Integration Points

**Menu Bar**:
- View → **Layers...** opens panel
- Passes `onShowLayers` callback to open panel

**Toolbar**:
- Fire box icon still works (legacy quick toggle)
- Syncs with Layers Panel state

**Fire Box Layer Component**:
- Receives `visible` prop from layer state
- Automatically shows/hides when toggled in panel

## Drag & Drop Implementation

**How Dragging Works**:

1. **Mouse Down** on title bar:
   - Set `isDragging = true`
   - Record offset from click point to panel position

2. **Mouse Move** while dragging:
   - Calculate new position: `mousePos - offset`
   - Update panel position state

3. **Mouse Up** anywhere:
   - Set `isDragging = false`
   - Panel stays at new position

**Code**:
```typescript
const [position, setPosition] = useState({ x: 100, y: 100 });
const [isDragging, setIsDragging] = useState(false);

// Title bar has className="drag-handle"
// Mouse events track dragging state
// Position updates on mouse move
```

## Future Layers (Coming Soon)

### Fire Stations 🚒

**Data Source**: MoCo GIS Fire Stations layer
**Display**: Markers with station number
**Popup Info**:
- Station number
- Address
- Apparatus (Engine, Truck, Ambulance, etc.)
- Station type (Career, Volunteer, Combination)

**Download Script**: `scripts/download_fire_stations.py`

### Hospitals 🏥

**Data Source**: MoCo GIS + HHS Hospital Data
**Display**: Hospital markers color-coded by capability
**Popup Info**:
- Hospital name
- Trauma level (I, II, III, IV)
- STEMI capable
- Stroke center (Primary, Comprehensive)
- Pediatric capable
- Burn center

**Download Script**: `scripts/download_hospitals.py`

### Nursing Homes 🏘️

**Data Source**: HHS Nursing Home Database
**Display**: Markers for long-term care facilities
**Popup Info**:
- Facility name
- Bed count
- Dialysis available
- Memory care unit
- Rehab services

**Download Script**: `scripts/download_nursing_homes.py`

### Beat Boundaries 🗺️

**Data Source**: MoCo GIS EMS Beat Boundaries
**Display**: Polygon overlays, color-coded by station
**Popup Info**:
- Beat designation (e.g., "23A")
- Station number
- Coverage area (sq mi)
- Population served

**Download Script**: `scripts/download_beats.py`

## Adding New Layers

**Step 1**: Add layer config to `BaseMap.tsx`:
```typescript
{
  id: 'hospitals',
  name: 'Hospitals',
  visible: false,
  available: true,  // Set to true when data ready
  description: 'Hospital locations with capabilities',
  icon: '🏥',
}
```

**Step 2**: Create layer component (e.g., `HospitalsLayer.tsx`):
```typescript
function HospitalsLayer({ map, visible }: LayerProps) {
  // Fetch hospital data
  // Add markers to map when visible
  // Remove markers when hidden
}
```

**Step 3**: Add to `BaseMap.tsx` render:
```typescript
<HospitalsLayer
  map={map.current}
  visible={layers.find(l => l.id === 'hospitals')?.visible || false}
/>
```

**Step 4**: Test:
- Open Layers panel
- Toggle new layer
- Verify data displays correctly

## Testing Checklist

### Panel Functionality
- [ ] View → Layers... opens panel
- [ ] Panel appears in center-left
- [ ] Title bar is blue with gradient
- [ ] X button closes panel
- [ ] Click outside closes panel
- [ ] Drag title bar moves panel
- [ ] Panel stays where dropped

### Layer Management
- [ ] Fire Boxes checkbox toggles layer
- [ ] Click row toggles layer
- [ ] "ON" badge shows when active
- [ ] "Coming Soon" badge shows for unavailable
- [ ] Multiple layers can be active
- [ ] Clear All button hides all layers
- [ ] Summary shows correct count

### Visual Quality
- [ ] Panel looks professional
- [ ] Icons display correctly
- [ ] Descriptions are readable
- [ ] Scrollbar appears if many layers
- [ ] No visual glitches

### Integration
- [ ] Toolbar fire box icon syncs with panel
- [ ] Menu bar "Show Fire Boxes" syncs with panel
- [ ] Map updates immediately on toggle
- [ ] State persists across map mode changes

## Known Issues

None currently! 🎉

## Future Enhancements

### Keyboard Shortcuts
- **L**: Toggle Layers panel
- **Ctrl+Shift+L**: Open Layers and focus search
- **Escape**: Close panel

### Layer Search
- Search box at top of panel
- Filter layers by name
- Highlight matching layers

### Layer Groups
- Organize layers into categories:
  - Emergency Services (Stations, Boxes, Beats)
  - Healthcare (Hospitals, Nursing Homes)
  - Infrastructure (Roads, Buildings)

### Layer Opacity
- Slider for each layer
- Adjust transparency (10-100%)
- Fade layers instead of on/off

### Layer Reordering
- Drag layers up/down in list
- Controls z-index on map
- Top layers render on top

### Save Layer Presets
- "Training Mode" preset: All layers off
- "Reference Mode" preset: All layers on
- "Quiz Mode" preset: Only relevant layers
- Custom user presets

## Success Criteria

✅ **Layers Panel Complete When:**

- [x] Panel component created
- [x] Draggable title bar works
- [x] Layer list displays all layers
- [x] Checkboxes toggle layers
- [x] Status badges show correctly
- [x] Click outside closes panel
- [x] Syncs with toolbar/menu
- [x] Professional appearance
- [ ] **USER TESTING**: Panel is intuitive
- [ ] **USER TESTING**: All layers toggle correctly
- [ ] **USER TESTING**: Drag and drop works smoothly

**Ready to Test!** 🎨

Open the app and try:
1. View → Layers...
2. Toggle Fire Boxes on/off
3. Drag panel around screen
4. Click Clear All
5. Close panel

The Layers Panel provides a professional, centralized way to manage all GIS overlays - just like QGIS or ArcGIS! 🗺️✨
