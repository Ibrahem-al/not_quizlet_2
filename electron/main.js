import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

const DEV_ORIGIN = 'http://localhost:5173';

// Restrictive Content-Security-Policy for renderer content. In production the
// app is served from file:// so scripts are limited to 'self'. In dev, Vite's
// HMR needs inline/eval scripts and a websocket connection to the dev server.
function buildCsp() {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'wasm-unsafe-eval'";
  const connectSrc = isDev
    ? `connect-src 'self' ${DEV_ORIGIN} ws://localhost:5173 https: wss:`
    : "connect-src 'self' https: wss:";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    connectSrc,
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
  ].join('; ');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Inject a restrictive CSP on every response loaded by this window's session.
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildCsp()],
      },
    });
  });

  const startUrl = isDev
    ? DEV_ORIGIN
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Open new-window requests (window.open, target="_blank") in the system
  // browser instead of spawning an in-app privileged BrowserWindow.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block navigation away from the app origin; send off-origin links to the
  // system browser rather than navigating the privileged renderer to them.
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    let allowed = false;
    try {
      const parsed = new URL(navigationUrl);
      allowed = isDev ? parsed.origin === DEV_ORIGIN : parsed.protocol === 'file:';
    } catch {
      allowed = false;
    }
    if (!allowed) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });

  // Clear the reference when the window is closed so the macOS `activate`
  // guard (`if (mainWindow === null)`) can recreate it.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
