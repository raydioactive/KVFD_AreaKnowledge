# MoCo EMS Trainer

Montgomery County Fire & Rescue Service (MCFRS) Area Familiarization & Destination Trainer

A standalone desktop application for training EMS providers on geographic awareness, facility knowledge, protocol-driven destination selection, and routing.

## Project Status

**Phase 1: Foundation & Integration** ✅ Complete

- ✅ Project structure created
- ✅ Electron + Python integration working
- ✅ Feature flag system implemented
- ✅ Database schema converted to SpatiaLite
- ✅ Minimal FastAPI backend with health check
- ✅ React frontend with MapLibre
- ✅ Map mode toggle (Training/Reference)

**Phase 2: Offline Maps & Routing** ✅ **COMPLETE - TRUE OFFLINE MODE IMPLEMENTED**

- ✅ **Planetiler tile generation** - Generates vector tiles from OSM data locally
- ✅ **100% offline capability** - Works entirely without internet after setup
- ✅ FastAPI tile server (`/tiles/{z}/{x}/{y}.pbf`) - Serves local MBTiles
- ✅ **Training Mode** - Vector map with NO street labels (forces geographic memory)
- ✅ **Reference Mode** - Vector map WITH street labels (for studying)
- ✅ Seamless map mode toggle - Switch between modes in real-time
- ✅ GraphHopper routing engine - Offline turn-by-turn routing
- ✅ Turn-by-turn routing API (`/api/routing/route`)
- ✅ Route display with directions panel
- ✅ Routing test panel for interactive testing

**Critical Achievement:** App now works with NO internet connection after initial setup! 🚒

**📖 See [OFFLINE_SETUP.md](OFFLINE_SETUP.md) for setup & testing instructions**
**📖 See [OPTION_B_IMPLEMENTATION.md](OPTION_B_IMPLEMENTATION.md) for technical details**

## Technology Stack

- **Desktop Framework**: Electron 28
- **Backend**: Python 3.11+ with FastAPI
- **Frontend**: React 18 + TypeScript + Vite
- **Maps**: MapLibre GL JS
- **Database**: SQLite + SpatiaLite
- **Packaging**: electron-builder, PyInstaller

## Prerequisites

### Required Software

1. **Node.js** 20+ and npm
   - Download: https://nodejs.org/

2. **Python** 3.11+ (3.13 recommended)
   - Download: https://www.python.org/downloads/
   - Make sure to check "Add Python to PATH" during installation

3. **Java** 11+ (for GraphHopper routing and Planetiler tile generation)
   - Download: https://adoptium.net/
   - Verify with: `java -version`

4. **SpatiaLite**
   - Windows: Download `mod_spatialite.dll` from https://www.gaia-gis.it/gaia-sins/windows-bin-NEXTGEN/
   - Place the DLL in `backend/spatialite/` folder or your Python installation directory

## Development Setup

### 1. Install Node Dependencies

```bash
cd C:\Users\julih\Coding\KVFD_Quiz

# Install root dependencies (Electron)
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Set Up Python Environment

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

cd ..
```

### 3. Initialize Database

```bash
cd backend
venv\Scripts\activate
python app\database.py

# You should see: "Database initialized successfully!"
cd ..
```

### 4. Download Offline Data (Required for Phase 2)

**One-time setup** - Downloads OSM data and generates offline map tiles:

```bash
python scripts/download_tiles.py
```

This will:
- Download Maryland OSM data (~50 MB)
- Download GraphHopper routing engine (~30 MB)
- Download Planetiler tile generator (~50 MB)
- **Generate offline vector tiles (~200-500 MB)** - Takes 5-15 minutes

**See [OFFLINE_SETUP.md](OFFLINE_SETUP.md) for detailed setup instructions.**

## Running the Application

### Development Mode (4 Terminals Required)

**Terminal 1 - Python Backend:**
```bash
cd backend
venv\Scripts\activate
python -m uvicorn app.main:app --reload
```

Wait for: `Uvicorn running on http://127.0.0.1:8000`

**Terminal 2 - GraphHopper Routing Engine:**
```bash
python routing/start_graphhopper.py
```

Wait for: `GRAPHHOPPER READY FOR ROUTING` (may take 5-10 minutes on first run)

**Terminal 3 - Frontend (Vite):**
```bash
cd frontend
npm run dev
```

Wait for: `Local: http://localhost:5173/`

**Terminal 4 - Electron:**
```bash
set SKIP_PYTHON_SPAWN=true
npm run dev
```

The Electron window should open showing the map!

### Expected Behavior

1. **Electron Window Opens**: Shows "Loading MoCo EMS Trainer..."
2. **Backend Connects**: Python server starts on port 8000
3. **Map Loads**: Offline vector tiles display (Maryland)
4. **Training Mode** (default): Map with NO street labels
5. **Toggle Works**: Switch to "Reference Mode" to see street labels
6. **Routing Test Panel**: Click two points to test offline routing
7. **Route Displays**: Turn-by-turn directions with distance and duration

### Testing Offline Mode

After initial setup, **disconnect from internet** and verify all features still work:

```bash
# 1. Disconnect WiFi/ethernet
# 2. Start all 4 terminals (as above)
# 3. Verify:
#    ✓ Map displays
#    ✓ Mode toggle works
#    ✓ Routing calculates
#    ✓ Directions display
```

**See [OFFLINE_SETUP.md](OFFLINE_SETUP.md) for comprehensive testing guide.**

## Building for Production

### Build Python Backend

```bash
cd backend
venv\Scripts\activate
python build_exe.py
```

Output: `backend\dist\moco-ems-backend.exe`

**Important**: Copy `mod_spatialite.dll` to the same directory as the .exe

### Build Frontend

```bash
cd frontend
npm run build
```

Output: `frontend\dist\`

### Build Electron App

```bash
# Windows installer
npm run build:win

# macOS installer (on Mac only)
npm run build:mac
```

Output: `build\moco-ems-trainer-setup.exe` (Windows) or `build\moco-ems-trainer.dmg` (Mac)

## Project Structure

```
KVFD_Quiz/
├── electron/               # Electron main process
│   ├── main.js            # Spawns Python, creates window
│   └── preload.js         # IPC bridge
│
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── map/       # MapLibre components
│   │   ├── pages/
│   │   ├── config/        # Feature flags
│   │   └── api/           # API client
│   └── package.json
│
├── backend/               # Python FastAPI
│   ├── app/
│   │   ├── main.py        # FastAPI entry
│   │   ├── database.py    # SQLite connection
│   │   ├── config/        # Feature flags
│   │   ├── models/        # (future)
│   │   ├── routers/       # (future)
│   │   └── services/      # (future)
│   └── requirements.txt
│
├── database/
│   ├── schema/            # SQL files
│   └── ems_trainer.db     # SQLite database (created on init)
│
└── tiles/
    └── styles/            # Map styles (training/reference)
```

## Feature Flags

The app uses a modular feature flag system. To enable/disable features, edit:

**Backend**: `backend/app/config/features.py`

```python
class FeatureFlags(BaseModel):
    enable_street_labels_toggle: bool = True  # Toggle between modes
    quiz_beat_identification: bool = True      # Enable beat quiz
    # ... etc
```

Features are automatically synced to the frontend via the `/api/features` endpoint.

## Troubleshooting

### "Database initialization failed"
- Make sure SpatiaLite is installed and `mod_spatialite.dll` is in your PATH
- Check Python version: `python --version` (should be 3.11+)
- Try running database init manually: `python backend/app/database.py --force`

### "Failed to connect to backend"
- Check if Python backend is running on port 8000
- Look for errors in Terminal 1 (Python backend)
- Try: `curl http://127.0.0.1:8000/health`

### "Map not loading"
- Check internet connection (Phase 1 uses online OSM tiles)
- Check browser console for errors (Ctrl+Shift+I in Electron)
- Verify frontend is running on port 5173

### "Electron window is blank"
- Make sure frontend build is complete: `cd frontend && npm run build`
- Check Electron console for errors
- Try development mode first

## API Endpoints

Currently available (Phase 1):

- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /api/features` - Feature flags
- `GET /api/stations` - Stations (placeholder)
- `GET /api/beats` - Beats (placeholder)
- `GET /api/facilities` - Facilities (placeholder)

## Phase 2 Quick Start

### 1. Download Map Tiles & Routing Data

```bash
python scripts/download_tiles.py
```

This downloads ~500-600MB of data (tiles + OSM data + GraphHopper).

### 2. Start GraphHopper Routing Engine

**New Terminal** - GraphHopper:
```bash
python routing/start_graphhopper.py
```

**First run takes ~5-10 minutes** to build routing graph. Subsequent runs are fast (~20 seconds).

### 3. Run the App (4 terminals)

Keep all 4 terminals running:

**Terminal 1** - GraphHopper:
```bash
python routing/start_graphhopper.py
```

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

### 4. Test Offline Maps & Routing

1. **Toggle between Training/Reference modes** - see labels appear/disappear
2. **Use Routing Test Panel** (bottom-left):
   - Click "Start"
   - Click two points on map (Point A and Point B)
   - Click "Calculate Route"
   - See turn-by-turn directions!

**Full guide:** See [PHASE2_GUIDE.md](PHASE2_GUIDE.md) for detailed instructions and troubleshooting.

---

## Next Steps (Phase 3)

- Ingest real Montgomery County facility data (hospitals, nursing homes, schools)
- Display facility markers on map
- Implement facility filtering and search
- Add protocol engine for STEMI/Stroke/Trauma destination selection

## Contributing

This project follows the implementation plan in `.claude/plans/bright-doodling-codd.md`

## License

MIT

## Contact

Montgomery County Fire & Rescue Service
