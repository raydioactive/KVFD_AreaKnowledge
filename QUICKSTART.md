# Quick Start Guide

Get the MoCo EMS Trainer running in 5 minutes!

## Step 1: Install Prerequisites (One-time)

1. **Install Node.js 20+**: https://nodejs.org/ (choose LTS version)
2. **Install Python 3.11+**: https://www.python.org/downloads/
   - ✅ Check "Add Python to PATH" during installation!

## Step 2: Install Dependencies (One-time)

Open **PowerShell** or **Command Prompt** in the project folder:

```bash
cd C:\Users\julih\Coding\KVFD_Quiz

# Install Node packages
npm install
cd frontend
npm install
cd ..

# Install Python packages
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Step 3: Initialize Database (One-time)

```bash
cd backend
venv\Scripts\activate
python app\database.py
```

You should see: ✅ "Database initialized successfully!"

## Step 4: Run the App (Every time)

### Option A: Development Mode (3 terminals)

**Terminal 1 - Python:**
```bash
cd backend
venv\Scripts\activate
python app\main.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Electron:**
```bash
set NODE_ENV=development
npm run dev
```

### Option B: Quick Script (Coming soon)
We'll add a startup script to launch all 3 at once!

## What You'll See

1. **Electron window opens** with "Loading..." screen
2. **Map loads** showing Montgomery County
3. **Toggle in top-left** switches between Training/Reference modes
4. **Yellow notice** says "Phase 1 - Development Mode"

## Troubleshooting

**"No module named 'fastapi'"**
→ Make sure you activated the venv: `venv\Scripts\activate`

**"Cannot find module 'electron'"**
→ Run `npm install` in the root directory

**"Database initialization failed"**
→ Install SpatiaLite: Download `mod_spatialite.dll` from https://www.gaia-gis.it/gaia-sins/

**Map not loading**
→ Check internet connection (using online tiles for now)

## Success Checklist

- [ ] Electron window opens without errors
- [ ] Python backend shows "Uvicorn running on http://127.0.0.1:8000"
- [ ] Map displays with Montgomery County centered
- [ ] Toggle button switches between "Training" and "Reference"
- [ ] No error messages in any terminal

## Next Steps

Once Phase 1 is working:
- Phase 2: Download offline map tiles
- Phase 3: Add real facility data from Montgomery County GIS
- Phase 4: Implement protocol engine
- Phase 5: Add quiz modes

## Need Help?

Check the full [README.md](README.md) for detailed documentation.
