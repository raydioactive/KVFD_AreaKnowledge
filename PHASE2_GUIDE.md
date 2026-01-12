# Phase 2: Offline Maps & Routing - Complete Guide

## What's New in Phase 2

Phase 2 adds **offline map tiles** and **turn-by-turn routing** to the MoCo EMS Trainer:

✅ **Offline Map Tiles** - No internet required after initial download
✅ **Training vs Reference Modes** - Actually different now (no labels vs labels)
✅ **GraphHopper Routing** - Turn-by-turn directions
✅ **Routing Test Panel** - Click two points, get directions
✅ **Automated Download** - One script downloads everything

---

## Prerequisites

Before starting Phase 2, ensure you have:

- [x] **Phase 1 working** (Electron + Python + Map displaying)
- [x] **Java 11+** installed (check with `java -version`)
- [x] **Good internet connection** (~500-600MB download)
- [x] **~1GB free disk space** (for tiles + routing data)

---

## Step-by-Step Setup

### Step 1: Install New Python Dependencies

```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

This installs `tqdm` (for progress bars) and `routingpy` (for GraphHopper integration).

### Step 2: Download Map Tiles & Routing Data

Run the automated downloader:

```bash
# From project root
python scripts/download_tiles.py
```

This downloads:
- ✓ Maryland map tiles (~200-500MB) → `tiles/maryland.mbtiles`
- ✓ Maryland OSM data (~50MB) → `routing/graphhopper/maryland-latest.osm.pbf`
- ✓ GraphHopper JAR (~30MB) → `routing/graphhopper/graphhopper-web-8.0.jar`

**Expected output:**
```
DOWNLOADING MARYLAND MAP TILES
...
✓ Downloaded successfully: maryland.mbtiles
✓ Verified: maryland.mbtiles is a valid MBTiles file

DOWNLOADING MARYLAND OSM DATA (for routing)
...
✓ OSM data ready for routing!

DOWNLOADING GRAPHHOPPER ROUTING ENGINE
...
✓ GraphHopper ready!

DOWNLOAD SUMMARY
  Map Tiles:    ✓ Success
  OSM Data:     ✓ Success
  GraphHopper:  ✓ Success

✓ All downloads complete! Ready for Phase 2.
```

---

### Step 3: Start GraphHopper Routing Engine

**Terminal 1** - GraphHopper (first time takes ~5-10 min to build graph):

```bash
python routing/start_graphhopper.py
```

**First run output:**
```
STARTING GRAPHHOPPER ROUTING ENGINE
Found JAR: graphhopper-web-8.0.jar

⚠️  First run detected!
GraphHopper will build the routing graph from OSM data.
This process takes ~5-10 minutes for Maryland.
Subsequent starts will be much faster.

Starting GraphHopper server...
✓ GraphHopper process started (PID: 12345)
Waiting for GraphHopper to be ready...
...
✓ GraphHopper is ready!

GRAPHHOPPER READY FOR ROUTING
API: http://127.0.0.1:8989
Health: http://127.0.0.1:8989/health
```

**Subsequent runs** (after graph is built):
- Graph cache exists, startup takes ~10-20 seconds

---

### Step 4: Run the Application

**Terminal 2** - Python Backend:
```bash
cd backend
venv\Scripts\activate
python app\main.py
```

**Terminal 3** - Frontend:
```bash
cd frontend
npm run dev
```

**Terminal 4** - Electron:
```bash
set NODE_ENV=development
npm run dev
```

---

## Testing Phase 2 Features

### Feature 1: Offline Map Tiles

1. **Disconnect internet** (optional - to verify offline capability)
2. **Open the app**
3. **Map loads from local tiles** (not OpenStreetMap)
4. **Toggle between Training/Reference modes**
   - **Training Mode**: NO street labels (clean map, forces memory)
   - **Reference Mode**: Street labels visible (study mode)

**Success criteria:**
- Map displays without internet connection
- Different styles actually show/hide labels
- Map is smooth and responsive

---

### Feature 2: Turn-by-Turn Routing

1. **Open the Routing Test Panel** (bottom-left of map)
2. **Click "Start"**
3. **Click on the map** to select Point A (origin) - green marker appears
4. **Click on the map** to select Point B (destination) - red marker appears
5. **Click "Calculate Route"**
6. **Route displays** on the map (blue line)
7. **Turn-by-turn directions** appear in the panel

**Success criteria:**
- Route calculates in < 2 seconds
- Blue route line displays on map
- Turn-by-turn directions include street names
- Distance and duration are shown
- Can clear route and try again

---

## Verifying Everything Works

### Test Checklist

- [ ] **Tiles Downloaded**: `tiles/maryland.mbtiles` exists (~200-500MB)
- [ ] **OSM Data Downloaded**: `routing/graphhopper/maryland-latest.osm.pbf` exists (~50MB)
- [ ] **GraphHopper JAR**: `routing/graphhopper/graphhopper-web-8.0.jar` exists (~30MB)
- [ ] **Graph Cache Built**: `routing/graphhopper/graph-cache/` directory exists
- [ ] **GraphHopper Running**: Visit http://127.0.0.1:8989/health shows `{"status":"ok"}`
- [ ] **Tile Server Working**: Visit http://127.0.0.1:8000/tiles/health shows tiles available
- [ ] **Map Style Loaded**: http://127.0.0.1:8000/styles/training-mode.json returns JSON
- [ ] **Offline Map Displays**: Map loads with local tiles
- [ ] **Labels Toggle**: Training mode has no labels, Reference mode has labels
- [ ] **Routing Works**: Can click two points and get a route

---

## Troubleshooting

### "GraphHopper failed to start"

**Problem**: Java not found or wrong version

**Solution**:
```bash
java -version
# Should show Java 11 or newer
# If not, install from: https://adoptium.net/
```

---

### "Map tiles not available"

**Problem**: Tiles not downloaded or wrong location

**Solution**:
```bash
python scripts/download_tiles.py --force
# Re-downloads tiles
```

Verify file exists:
```bash
dir tiles\maryland.mbtiles
# Should show file size ~200-500MB
```

---

### "Routing service unavailable"

**Problem**: GraphHopper not running

**Solution**:
1. Check if GraphHopper is running:
   ```bash
   curl http://127.0.0.1:8989/health
   # Should return {"status":"ok"}
   ```

2. If not running, start it:
   ```bash
   python routing/start_graphhopper.py
   ```

3. Check Python backend can reach it:
   ```bash
   curl http://127.0.0.1:8000/api/routing/health
   # Should show routing_available: true
   ```

---

### "Map displays but styles don't switch"

**Problem**: Style files not loading

**Solution**:
1. Check style files exist:
   ```bash
   dir tiles\styles\training-mode.json
   dir tiles\styles\reference-mode.json
   ```

2. Check backend serves them:
   ```bash
   curl http://127.0.0.1:8000/styles/training-mode.json
   # Should return JSON
   ```

3. Check browser console (F12) for errors

---

### "Route calculation is slow (>10 seconds)"

**Problem**: Graph cache not built or corrupted

**Solution**:
1. Stop GraphHopper
2. Delete graph cache:
   ```bash
   rmdir /s routing\graphhopper\graph-cache
   ```
3. Restart GraphHopper (will rebuild graph in ~5-10 min)

---

### "Out of memory error" when building graph

**Problem**: Java heap size too small

**Solution**:
```bash
# Increase memory allocation
python routing/start_graphhopper.py --memory 2
# Uses 2GB instead of default 1GB
```

---

## Architecture Overview

### How It Works

1. **Map Tiles**:
   - Stored in `tiles/maryland.mbtiles` (SQLite database)
   - FastAPI serves tiles via `/tiles/{z}/{x}/{y}.pbf`
   - MapLibre fetches tiles from local server (not internet)
   - Two styles switch between showing/hiding labels

2. **Routing**:
   - GraphHopper runs as separate Java server (port 8989)
   - Python `routing_service.py` queries GraphHopper via `routingpy`
   - FastAPI exposes routing at `/api/routing/route`
   - Frontend POSTs origin/destination, gets back geometry + directions

3. **Data Flow**:
   ```
   [User clicks map]
   → [Frontend sends coords to FastAPI]
   → [FastAPI calls GraphHopper]
   → [GraphHopper calculates route]
   → [Route returned to frontend]
   → [RouteLayer displays on map]
   ```

---

## What's Next: Phase 3

Phase 3 will add:
- 🏥 Real Montgomery County facility data (hospitals, nursing homes, etc.)
- 📍 GIS data ingestion from MoCo ArcGIS services
- 🗺️ Facility markers on the map
- 🔍 Facility filtering and search

**To prepare for Phase 3:**
- Phase 2 must be fully working
- Routing should calculate successfully
- Offline maps should display properly

---

## Quick Reference Commands

```bash
# Download everything
python scripts/download_tiles.py

# Start GraphHopper
python routing/start_graphhopper.py

# Start backend
cd backend && venv\Scripts\activate && python app\main.py

# Start frontend
cd frontend && npm run dev

# Start Electron
set NODE_ENV=development && npm run dev

# Check GraphHopper health
curl http://127.0.0.1:8989/health

# Check tile server health
curl http://127.0.0.1:8000/tiles/health

# Check routing health
curl http://127.0.0.1:8000/api/routing/health
```

---

## Success! You've Completed Phase 2

✅ **Offline maps working**
✅ **Training/Reference modes functional**
✅ **GraphHopper routing operational**
✅ **Turn-by-turn directions displaying**

**Ready for Phase 3: Facility Data Integration!**
