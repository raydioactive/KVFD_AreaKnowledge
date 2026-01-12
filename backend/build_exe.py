"""
PyInstaller build script for MoCo EMS Trainer Backend
Creates a standalone executable for Windows/Mac
"""
import PyInstaller.__main__
import sys
import os
from pathlib import Path

# Get the project root
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR = Path(__file__).parent
APP_DIR = BACKEND_DIR / "app"
SCHEMA_DIR = PROJECT_ROOT / "database" / "schema"

# Build arguments for PyInstaller
build_args = [
    str(APP_DIR / "main.py"),  # Entry point
    '--name=moco-ems-backend',  # Output name
    '--onefile',  # Single executable
    '--clean',  # Clean build
    '--noconfirm',  # Overwrite without asking

    # Add data files
    f'--add-data={SCHEMA_DIR}{os.pathsep}database/schema',  # SQL schema files

    # Hidden imports (modules not detected by PyInstaller)
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.protocols.websockets',
    '--hidden-import=uvicorn.protocols.websockets.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--hidden-import=sqlite3',

    # Collect all submodules
    '--collect-all=fastapi',
    '--collect-all=starlette',
    '--collect-all=pydantic',

    # Platform-specific options
]

# Add console/windowed flag based on platform
if sys.platform == 'win32':
    # On Windows, use --console to show output during development
    # Change to --windowed for production to hide console
    build_args.append('--console')
else:
    # On Unix-like systems, use console
    build_args.append('--console')

print("=" * 60)
print("Building MoCo EMS Trainer Backend with PyInstaller")
print("=" * 60)
print(f"Platform: {sys.platform}")
print(f"Project root: {PROJECT_ROOT}")
print(f"Entry point: {APP_DIR / 'main.py'}")
print(f"Output directory: {BACKEND_DIR / 'dist'}")
print("=" * 60)

# Note about SpatiaLite
print("\nNOTE: SpatiaLite extension must be available separately.")
print("For Windows: Place mod_spatialite.dll in the same directory as the .exe")
print("For macOS: Install via: brew install spatialite-tools")
print("For Linux: Install via: apt-get install libspatialite-dev")
print("=" * 60)

try:
    # Run PyInstaller
    PyInstaller.__main__.run(build_args)

    print("\n" + "=" * 60)
    print("BUILD SUCCESSFUL!")
    print("=" * 60)
    print(f"Executable location: {BACKEND_DIR / 'dist' / 'moco-ems-backend.exe'}")
    print("\nNext steps:")
    print("1. Test the executable: ./backend/dist/moco-ems-backend.exe --port 8000")
    print("2. Ensure SpatiaLite DLL is in the same directory")
    print("3. Run Electron to test integration")
    print("=" * 60)

except Exception as e:
    print("\n" + "=" * 60)
    print("BUILD FAILED!")
    print("=" * 60)
    print(f"Error: {e}")
    sys.exit(1)
