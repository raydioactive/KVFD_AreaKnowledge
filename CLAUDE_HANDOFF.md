# Claude Handoff - MoCo EMS Area Knowledge Trainer

**Last Updated:** January 2025
**Repo:** https://github.com/raydioactive/KVFD_AreaKnowledge

## What This Is

A station-centric training app for Montgomery County (Maryland) Fire/EMS providers to learn their first-due area geography. Built for KVFD (Kensington Volunteer Fire Department - Station 5).

## Current State: WORKING

The app is functional. User can:
- Select their home station (persisted to localStorage)
- View fire box boundaries with first-due highlighting (red = your boxes, blue = others)
- Take address quizzes (click location of given addresses on map)
- View hospitals, nursing homes, fire stations as map layers
- See routing instability zones (places where GPS gives bad routes)
- Toggle between Training Mode (no labels) and Reference Mode (with labels)

## Tech Stack

- **Frontend:** React + TypeScript + Vite + MapLibre GL + Tailwind
- **Backend:** FastAPI (Python) on port 8000
- **Routing:** GraphHopper on port 8989
- **Desktop:** Electron (optional)
- **Data:** GeoJSON files in `data/gis/`

## To Run

```powershell
# Terminal 1: Backend
cd backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# Terminal 2: GraphHopper (for routing features)
cd routing/graphhopper
java -jar graphhopper-web-8.0.jar server config.yml

# Terminal 3: Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/components/map/BaseMap.tsx` | Main map component, orchestrates everything |
| `frontend/src/components/map/FireBoxLayer.tsx` | Fire box boundaries with station-based coloring |
| `frontend/src/components/quiz/AddressQuiz.tsx` | Address location quiz game |
| `frontend/src/store/stationStore.ts` | Zustand store for selected station |
| `backend/app/routers/gis.py` | GIS data endpoints (fire boxes, instabilities) |
| `backend/app/routers/facilities.py` | Hospital/nursing home/station endpoints |
| `data/gis/hospitals.geojson` | Hospital data with EMS designations |
| `data/gis/nursing_homes.geojson` | Nursing home/SNF data |
| `data/gis/fire_boxes.geojson` | Fire box boundary polygons |
| `scripts/find_routing_instabilities.py` | Detects GPS routing edge cases |
| `scripts/geocode_facilities.py` | Geocodes facility addresses |

## Recent Work (This Session)

1. **Quiz Settings** - Added configurable question count (5/10/20/50) and endless mode
2. **Routing Instability Detection** - Created script to find adjacent addresses where routes differ dramatically (like Shaftsbury St edge case)
3. **Routing Instability Layer** - Visualizes instability zones on map with severity colors
4. **Hospital Data** - Curated 17 hospitals with EMS designations (trauma, STEMI, stroke, burn, pediatric)
5. **Nursing Home Data** - Added 29 facilities including Kensington Healthcare Center and others in Station 5 area
6. **Geocoding** - Ran geocoding script to fix facility coordinates (some may still be off)
7. **Git Setup** - Initialized repo and pushed to GitHub

## Known Issues / Next Steps

1. **Hospital/Nursing Home Geocodes** - Some coordinates may still be wrong. User should test on map and report which ones are in wrong locations. Can manually fix or re-geocode specific addresses.

2. **Large GeoJSON Files** - `addresses_all.geojson` is 70MB. Consider Git LFS or splitting by station area.

3. **Missing Binaries** - These are in .gitignore and must be downloaded separately:
   - `routing/graphhopper/graphhopper-web-8.0.jar`
   - `routing/planetiler/planetiler.jar`
   - `backend/spatialite/mod_spatialite.dll`

4. **Potential Features:**
   - Quiz filtering by facility type
   - Route visualization for address quiz
   - More station-specific data
   - Offline tile generation

## Fire Box Pattern

Fire box BEAT IDs follow pattern: first 2 digits = station number
- `0501`, `0502`, etc. = Station 5's boxes
- `2101`, `2102`, etc. = Station 21's boxes

This is used for first-due highlighting and quiz filtering.

## User Context

The user is an EMS provider at Station 5 (Kensington VFD). They respond to calls in the Kensington/North Bethesda/Garrett Park area. Key concerns:
- Learning street locations for faster response
- Knowing hospital capabilities for patient destinations
- Understanding routing quirks in their area
- Training new members on area geography
