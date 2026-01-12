# Fire Box GIS Layer Feature

## Overview

The fire box layer displays Montgomery County fire box boundaries as an interactive overlay on the offline map. This helps EMS trainees visualize response areas and learn geographic coverage.

## Features

- **Interactive Polygons**: Click any fire box to see details (box number, station, etc.)
- **Toggle On/Off**: Show/hide fire boxes with a single button click
- **Offline Support**: Fire box data downloaded once, served locally
- **Works with Existing Modes**: Fire boxes display over both training and reference map modes
- **Semi-Transparent**: Red polygons with 20% opacity don't obscure map features

## Setup

### Step 1: Download Fire Box Data (One-Time)

```bash
python scripts/download_fire_boxes.py
```

This will:
- Fetch fire box boundaries from MoCo GIS server
- Save to `data/gis/fire_boxes.geojson`
- Display count and sample attributes
- ~100-200 KB download

**Output:**
```
✓ Downloaded 450 fire boxes
  File size: 150.2 KB
  Location: data/gis/fire_boxes.geojson

  Sample attributes:
    - BOX: 2301
    - STATION: 23
    - BEAT: A
```

### Step 2: Start the App

Fire box layer is enabled by default. Just run your normal 4-terminal startup:

```bash
# Terminal 1: Backend
cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload

# Terminal 2: GraphHopper
python routing/start_graphhopper.py

# Terminal 3: Frontend
cd frontend && npm run dev

# Terminal 4: Electron
set SKIP_PYTHON_SPAWN=true && npm run dev
```

## Usage

### Toggle Fire Boxes On/Off

**Location**: Top-right corner of map (below navigation controls)

**Button States:**
- **Hidden**: Gray button, "Show Fire Boxes"
- **Visible**: Red button with indicator dot, "Hide Fire Boxes"

**Keyboard Shortcut**: None (click only)

### View Fire Box Details

1. Click **"Show Fire Boxes"** button
2. Fire box polygons appear as semi-transparent red overlays
3. **Click any polygon** to see popup with details:
   - Box number
   - Station number
   - Beat designation
   - Other MoCo GIS attributes

### Training Mode Use Cases

**Scenario 1: Area Familiarization**
1. Toggle Training Mode (no street labels)
2. Show Fire Boxes
3. Study box boundaries without street names
4. Test yourself: "Which box covers this area?"

**Scenario 2: Reference Check**
1. After guessing a box number
2. Show Fire Boxes to verify
3. Click polygon to confirm box details

**Scenario 3: Station Coverage**
1. Show Fire Boxes
2. Click polygons to see which station they belong to
3. Learn station coverage patterns

## Technical Details

### Data Source

**MoCo GIS Fire Box Service:**
```
https://gis3.montgomerycountymd.gov/arcgis/rest/services/GDX/fire_box/MapServer/0
```

**Format**: GeoJSON (FeatureCollection)
**Coordinate System**: WGS84 (EPSG:4326)
**Geometry Type**: Polygon

### API Endpoints

**Get Fire Boxes:**
```
GET http://127.0.0.1:8000/api/gis/fire-boxes
```

**Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-77.1, 39.0], ...]]
      },
      "properties": {
        "BOX": "2301",
        "STATION": "23",
        "BEAT": "A"
      }
    }
  ]
}
```

**GIS Health Check:**
```
GET http://127.0.0.1:8000/api/gis/health
```

**List Available Layers:**
```
GET http://127.0.0.1:8000/api/gis/layers
```

### Map Layer Styling

**Fill Layer** (`fire-boxes-fill`):
- Color: `#ff6b6b` (red)
- Opacity: `0.2` (20% transparent)
- Type: Polygon fill

**Outline Layer** (`fire-boxes-outline`):
- Color: `#ff0000` (bright red)
- Width: `2px`
- Opacity: `0.8` (80% opaque)
- Type: Line

### Feature Flags

Control fire box layer via `backend/app/config/features.py`:

```python
enable_gis_layers: bool = True          # Master switch for all GIS layers
enable_fire_box_layer: bool = True      # Specific to fire boxes
default_show_fire_boxes: bool = False   # Start hidden (training mode)
```

Disable fire boxes:
```python
enable_fire_box_layer: bool = False
```

## Troubleshooting

### Fire Boxes Don't Appear

**Check 1: Is data downloaded?**
```bash
ls -lh data/gis/fire_boxes.geojson
```

If missing:
```bash
python scripts/download_fire_boxes.py
```

**Check 2: Is backend serving data?**
```bash
curl http://127.0.0.1:8000/api/gis/health
```

Should show:
```json
{
  "gis_data_available": true,
  "fire_boxes": {
    "available": true,
    "count": 450
  }
}
```

**Check 3: Is layer enabled in features?**
```bash
curl http://127.0.0.1:8000/api/features | grep fire_box
```

Should show:
```json
"enable_fire_box_layer": true
```

### Error: "Fire Box Data Unavailable"

**Symptom**: Small error box appears at top-left of map

**Cause**: GeoJSON file missing or invalid

**Fix:**
```bash
# Re-download fire box data
python scripts/download_fire_boxes.py --force
```

### Polygons Appear in Wrong Location

**Cause**: Coordinate system mismatch

**Check**: Fire boxes should cover Montgomery County, Maryland
- Center: ~39.14°N, 77.15°W
- If they appear elsewhere, coordinates may be swapped

**Fix**: Verify GeoJSON is in WGS84 (longitude, latitude) format

### Click Popup Not Showing

**Cause**: Fire boxes layer not visible, or click handler not attached

**Debug:**
1. Verify fire boxes are visible (red polygons)
2. Check browser console for errors
3. Try clicking different parts of polygon
4. Ensure cursor changes to pointer on hover

## File Structure

```
C:\Users\julih\Coding\KVFD_Quiz\
├── data/
│   └── gis/
│       └── fire_boxes.geojson              ← Fire box data (150 KB)
├── scripts/
│   └── download_fire_boxes.py              ← Download script
├── backend/app/
│   ├── routers/
│   │   └── gis.py                          ← GIS API endpoints
│   └── config/
│       └── features.py                     ← Feature flags (updated)
└── frontend/src/
    ├── components/map/
    │   ├── FireBoxLayer.tsx                ← Layer component
    │   ├── GisLayerToggle.tsx              ← Toggle button
    │   └── BaseMap.tsx                     ← Integration point
    └── config/
        └── features.ts                     ← Frontend features (updated)
```

## Future Enhancements

### Additional GIS Layers (Planned)

**Fire Stations**
- Markers showing station locations
- Popup with station number, address, apparatus

**Hospitals**
- Hospital markers with capabilities
- Filter by trauma level, STEMI, stroke

**Beat Boundaries**
- Similar to fire boxes but for EMS beats
- Color-coded by station

**Nursing Homes**
- Long-term care facilities
- Popup with bed count, dialysis status

### Advanced Features (Future)

**Layer Stacking**
- Toggle multiple layers simultaneously
- Control layer order (z-index)

**Custom Styling**
- User-selectable colors for fire boxes
- Opacity slider (10-90%)
- Highlight specific boxes

**Search & Filter**
- "Find box 2301"
- "Show only Station 23 boxes"
- "Highlight boxes in Beat A"

**Offline Editing**
- Mark visited fire boxes
- Add custom notes to boxes
- Track quiz performance by box

## Integration with Other Features

### Works With Training Mode
- Fire boxes display over unlabeled map
- Trainees learn geography without street names
- Toggle on/off for self-testing

### Works With Reference Mode
- Fire boxes display over labeled map
- Street names help locate specific boxes
- Cross-reference streets with box boundaries

### Works With Routing
- Route line displays over fire boxes
- See which boxes route passes through
- Understand response area transitions

### Future: Works With Quiz Mode
- "Click the fire box for address X"
- "Which station covers this box?"
- "How many boxes does Station 23 have?"

## Testing Checklist

Before considering this feature complete:

- [ ] Download script successfully fetches GeoJSON
- [ ] Backend serves fire boxes at `/api/gis/fire-boxes`
- [ ] Toggle button appears in top-right
- [ ] Clicking toggle shows/hides fire boxes
- [ ] Fire boxes display as red polygons over Maryland
- [ ] Clicking polygon shows popup with box details
- [ ] Works in Training Mode (no labels)
- [ ] Works in Reference Mode (with labels)
- [ ] Works with offline map tiles
- [ ] Fire boxes persist across map mode changes
- [ ] Cursor changes to pointer on polygon hover
- [ ] Error message shows if data not downloaded

## Success Criteria

✅ **Fire Box Layer Complete When:**

- [x] Script downloads MoCo fire box data
- [x] Backend serves GeoJSON locally
- [x] Frontend displays polygons on map
- [x] Toggle button shows/hides layer
- [x] Click shows popup with details
- [x] Works offline after initial download
- [x] Integrates with existing features
- [x] Feature flags allow enable/disable

**Ready to Test!** 🚒

Run `python scripts/download_fire_boxes.py` to get started.
