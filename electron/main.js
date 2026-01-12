/**
 * Electron Main Process
 * Spawns Python FastAPI backend and creates application window
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

let pythonProcess = null;
let apiPort = null;
let mainWindow = null;

/**
 * Find an available port
 * In development, use fixed port 8000
 * In production, could use dynamic port allocation
 */
async function getAvailablePort() {
  // For now, use fixed port
  // TODO: Use 'get-port' package for dynamic port allocation
  return 8000;
}

/**
 * Start the Python FastAPI backend
 */
async function startPythonBackend() {
  // Skip spawning Python if manually started (development)
  if (process.env.SKIP_PYTHON_SPAWN === 'true') {
    console.log('[Electron] Skipping Python spawn (already running manually)');
    apiPort = 8000;
    await waitForBackend(`http://127.0.0.1:${apiPort}/health`);
    console.log(`[Electron] Python backend ready on port ${apiPort}`);
    return apiPort;
  }

  console.log('[Electron] Starting Python backend...');

  // Get available port
  apiPort = await getAvailablePort();

  // Determine Python executable path
  let pythonExe;
  let pythonScript;

  if (app.isPackaged) {
    // Production mode: Use bundled Python executable
    pythonExe = path.join(process.resourcesPath, 'backend', 'moco-ems-backend.exe');
    pythonScript = null;  // Bundled exe doesn't need script
  } else {
    // Development mode: Use Python from venv
    const venvPython = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
    pythonExe = venvPython;
    pythonScript = path.join(__dirname, '..', 'backend', 'app', 'main.py');
  }

  // Set environment variables for Python backend
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    DATABASE_PATH: path.join(app.getPath('userData'), 'ems_trainer.db'),
    TILES_PATH: path.join(app.getPath('userData'), 'tiles')
  };

  // Spawn Python process
  const args = app.isPackaged ? ['--port', apiPort.toString()] : [pythonScript, '--port', apiPort.toString()];

  pythonProcess = spawn(pythonExe, args, {
    env,
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'backend', 'app')
  });

  // Log Python stdout
  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
  });

  // Log Python stderr
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Error] ${data.toString().trim()}`);
  });

  // Handle Python process exit
  pythonProcess.on('close', (code) => {
    console.log(`[Python] Process exited with code ${code}`);
    pythonProcess = null;
  });

  // Wait for Python backend to be ready
  await waitForBackend(`http://127.0.0.1:${apiPort}/health`);

  console.log(`[Electron] Python backend ready on port ${apiPort}`);
  return apiPort;
}

/**
 * Wait for backend to respond to health checks
 */
async function waitForBackend(healthUrl, maxAttempts = 30, intervalMs = 1000) {
  console.log(`[Electron] Waiting for backend at ${healthUrl}`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(healthUrl, { timeout: 500 });
      if (response.status === 200) {
        console.log('[Electron] Backend is ready!');
        return true;
      }
    } catch (error) {
      // Backend not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error('Backend failed to start within timeout period');
}

/**
 * Create the main application window
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'MoCo EMS Trainer'
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    // Development mode: Load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode: Load built files
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  // Send API port to renderer process once loaded
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('api-port', apiPort);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Application ready event
 */
app.on('ready', async () => {
  try {
    console.log('[Electron] Application starting...');

    // Start Python backend
    await startPythonBackend();

    // Create main window
    createMainWindow();

    console.log('[Electron] Application ready!');
  } catch (error) {
    console.error('[Electron] Failed to start application:', error);
    app.quit();
  }
});

/**
 * Quit when all windows are closed
 */
app.on('window-all-closed', () => {
  // Kill Python process
  if (pythonProcess) {
    console.log('[Electron] Killing Python process...');
    pythonProcess.kill();
  }

  // On macOS, applications stay active until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Re-create window on macOS when dock icon is clicked
 */
app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});

/**
 * IPC handlers
 */
ipcMain.handle('get-api-port', () => {
  return apiPort;
});

/**
 * Cleanup on app quit
 */
app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
