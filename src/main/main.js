const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'debug';
// Clear log file on startup to prevent large files
try {
  const logPath = log.transports.file.getFile().path;
  if (fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, '');
  }
} catch (e) {
  console.error('Failed to clear log file:', e);
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'debug';

// Handle updates
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info);
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available:', info);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info);
  // Ask user to update or just notify
});

let tray = null;
let configureWindow = null;
let overlayWindow = null;
let onboardingWindow = null;
let isOverlayEnabled = true;

// Window padding multiplier to prevent time label clipping at edges
// The window is larger than the ring to accommodate text outside the annulus
// Extra padding needed for left/right positions where horizontal text extends further
const WINDOW_PADDING_MULTIPLIER = 1.35;

// Auto-launch configuration
const autoLauncher = new AutoLaunch({
  name: 'DayRing',
  path: app.getPath('exe')
});

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Default settings
const defaultSettings = {
  onboardingComplete: false,
  wakeTime: { hour: 7, minute: 0 },
  sleepTime: { hour: 23, minute: 0 },
  opacity: 80,
  size: 200,
  rotation: 0,
  unallocatedColor: '#4a90d9',
  passedTimeColor: '#666666',
  position: { anchor: 'top-right', custom: null },
  autoStart: true,
  showTimeRemaining: true,
  positionLocked: false
};

// Load settings from file
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...defaultSettings };
}

// Save settings to file
function saveSettings(settings) {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return false;
  }
}

let settings = defaultSettings;

// Sync auto-launch with settings
async function syncAutoLaunch() {
  try {
    // In development logic: prevent auto-launch registration and clean up existing invalid entries
    if (!app.isPackaged) {
      const isEnabled = await autoLauncher.isEnabled();
      if (isEnabled) {
        console.log('Development mode detected: Removing invalid auto-launch entry...');
        await autoLauncher.disable();
      }
      return;
    }

    const isEnabled = await autoLauncher.isEnabled();
    if (settings.autoStart && !isEnabled) {
      await autoLauncher.enable();
    } else if (!settings.autoStart && isEnabled) {
      await autoLauncher.disable();
    }
  } catch (e) {
    console.error('Failed to sync auto-launch:', e);
  }
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/favicon.ico');

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = createDefaultIcon();
    }
  } catch (e) {
    trayIcon = createDefaultIcon();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('DayRing');

  updateTrayMenu();

  tray.on('double-click', () => {
    openConfigureFlow();
  });
}

function createDefaultIcon() {
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAA' +
    'dwAAAHcBMop2mgAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEFSURBVDiNpZM9' +
    'TsNAEIW/WS+OQAJCFHRcgAukoyEXsLmBOQIdN0g4ARdARUFBQUdDRxdZJCI2nnlbOD+OY0X8dJr35s3s' +
    'zjqIiNcdkBmk6qWqSJLvz17OTv4D0MJPwL0CRD6f/wjQxLeAe6lbNMBH6r8CRLTR8z/AcDj8AuGD4dg+' +
    'ALuHw38AegPsS6drgHNgT9L3AGRJu0BXkgGHEXE9n8/XQgg9YFfSNvCk7wGWnfPLzMwXxph8NpvdLoPU' +
    'BJLZ7MY5l/u+P5Y0BnLnXC8EfkXEhaRhCGF8cXFxs7GxMVoCSOomPD093ep0OhlwLemtpJ6kQaVSucz/' +
    'gX4HGI1G9cPDw8/5BwH8AMoIV60kvh0MAAAAAElFTkSuQmCC';

  return nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isOverlayEnabled ? 'Disable' : 'Enable',
      click: () => {
        isOverlayEnabled = !isOverlayEnabled;
        updateTrayMenu();
        toggleOverlay();
      }
    },
    {
      label: 'Configure Your Day',
      click: () => {
        openConfigureFlow();
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function toggleOverlay() {
  if (overlayWindow) {
    if (isOverlayEnabled) {
      overlayWindow.show();
    } else {
      overlayWindow.hide();
    }
  }
}

function openConfigureFlow() {
  // If onboarding not complete, show onboarding
  if (!settings.onboardingComplete) {
    createOnboardingWindow();
    return;
  }

  // After onboarding, always show Buy Me a Coffee screen first
  createBuyMeCoffeeWindow();
}

function createOnboardingWindow() {
  if (onboardingWindow) {
    onboardingWindow.focus();
    return;
  }

  onboardingWindow = new BrowserWindow({
    width: 550,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Welcome to DayRing',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../../assets/favicon.ico')
  });

  onboardingWindow.loadFile(path.join(__dirname, '../renderer/onboarding.html'));

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

function createBuyMeCoffeeWindow() {
  // Reuse onboarding window at Step 4 (Buy Me a Coffee)
  if (onboardingWindow) {
    onboardingWindow.focus();
    return;
  }

  onboardingWindow = new BrowserWindow({
    width: 550,
    height: 500,
    resizable: false,
    minimizable: false,
    maximizable: false,
    frame: false,
    title: 'Support DayRing',
    icon: path.join(__dirname, '../../assets/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  onboardingWindow.loadFile(path.join(__dirname, '../renderer/buymecoffee.html'));

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

function createConfigureWindow() {
  if (configureWindow) {
    configureWindow.focus();
    return;
  }

  configureWindow = new BrowserWindow({
    width: 500,
    height: 700,
    resizable: true,
    minimizable: true,
    maximizable: false,
    frame: false,
    title: 'DayRing - Configure Your Day',
    icon: path.join(__dirname, '../../assets/favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  configureWindow.loadFile(path.join(__dirname, '../renderer/configure.html'));

  configureWindow.on('closed', () => {
    configureWindow = null;
  });
}

let dragStartPos = null;
let dragStartBounds = null;
let dragCheckInterval = null;

function enableOverlayDragging() {
  if (!overlayWindow) return;

  // Make overlay respond to mouse events
  overlayWindow.setIgnoreMouseEvents(false);

  // Notify overlay that dragging is enabled
  if (overlayWindow.webContents) {
    overlayWindow.webContents.send('drag-mode-changed', true);
  }
}

function disableOverlayDragging() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    // Notify overlay that dragging is disabled
    if (overlayWindow.webContents) {
      overlayWindow.webContents.send('drag-mode-changed', false);
    }
  }
  isDraggingOverlay = false;
  dragStartPos = null;
  dragStartBounds = null;
}

function updateOverlayDraggingState() {
  if (!overlayWindow) return;

  // Enable dragging if position is not locked
  if (!settings.positionLocked) {
    enableOverlayDragging();
  } else {
    disableOverlayDragging();
  }
}

function handleOverlayDragStart(cursorX, cursorY) {
  if (!overlayWindow) return;
  isDraggingOverlay = true;
  dragStartPos = { x: cursorX, y: cursorY };
  dragStartBounds = overlayWindow.getBounds();
}

function handleOverlayDragMove(cursorX, cursorY) {
  if (!isDraggingOverlay || !overlayWindow || !dragStartPos || !dragStartBounds) return;

  const deltaX = cursorX - dragStartPos.x;
  const deltaY = cursorY - dragStartPos.y;

  const newX = dragStartBounds.x + deltaX;
  const newY = dragStartBounds.y + deltaY;

  overlayWindow.setBounds({
    x: newX,
    y: newY,
    width: dragStartBounds.width,
    height: dragStartBounds.height
  });
}

function handleOverlayDragEnd() {
  if (!isDraggingOverlay || !overlayWindow) return;

  isDraggingOverlay = false;
  const finalBounds = overlayWindow.getBounds();

  // Save custom position
  settings.position = {
    anchor: 'custom',
    custom: { x: finalBounds.x, y: finalBounds.y }
  };
  saveSettings(settings);

  // Notify configure window of position change
  if (configureWindow && configureWindow.webContents) {
    configureWindow.webContents.send('position-changed', { x: finalBounds.x, y: finalBounds.y });
  }

  dragStartPos = null;
  dragStartBounds = null;
}

let hoverCheckInterval = null;
let isHovering = false;
let isDraggingOverlay = false;

// Calculate position based on anchor preset
function getPositionForAnchor(anchor, windowSize, screenWidth, screenHeight) {
  const margin = 20; // Margin from screen edge for the visual ring

  // The visual ring is 74% of window size, centered in the window
  // So there's 13% padding on each side of the ring within the window
  // We offset positions so the ring (not the window) is at the margin from edge
  const ringPaddingPct = (1 - 0.74) / 2; // ~0.13
  const ringOffset = Math.round(windowSize * ringPaddingPct);

  const positions = {
    'top-left': { x: margin - ringOffset, y: margin - ringOffset },
    'top-center': { x: Math.floor((screenWidth - windowSize) / 2), y: margin - ringOffset },
    'top-right': { x: screenWidth - windowSize - margin + ringOffset, y: margin - ringOffset },
    'middle-left': { x: margin - ringOffset, y: Math.floor((screenHeight - windowSize) / 2) },
    'center': { x: Math.floor((screenWidth - windowSize) / 2), y: Math.floor((screenHeight - windowSize) / 2) },
    'middle-right': { x: screenWidth - windowSize - margin + ringOffset, y: Math.floor((screenHeight - windowSize) / 2) },
    'bottom-left': { x: margin - ringOffset, y: screenHeight - windowSize - margin + ringOffset },
    'bottom-center': { x: Math.floor((screenWidth - windowSize) / 2), y: screenHeight - windowSize - margin + ringOffset },
    'bottom-right': { x: screenWidth - windowSize - margin + ringOffset, y: screenHeight - windowSize - margin + ringOffset }
  };

  return positions[anchor] || positions['top-right'];
}

function createOverlayWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const size = settings.size || 200;
  const windowSize = Math.round(size * WINDOW_PADDING_MULTIPLIER);

  // Calculate position based on saved settings
  let x, y;
  if (settings.position && settings.position.custom) {
    // Use custom position
    x = settings.position.custom.x;
    y = settings.position.custom.y;
  } else {
    // Use anchor preset
    const anchor = settings.position?.anchor || 'top-right';
    const pos = getPositionForAnchor(anchor, windowSize, width, height);
    x = pos.x;
    y = pos.y;
  }

  overlayWindow = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html')).then(() => {
    updateOverlayWithSettings();
    // Enable dragging by default (unless position is locked)
    updateOverlayDraggingState();
  });

  if (!isOverlayEnabled) {
    overlayWindow.hide();
  }

  // Start hover detection
  startHoverDetection();
}

function startHoverDetection() {
  if (hoverCheckInterval) {
    clearInterval(hoverCheckInterval);
  }

  const { screen } = require('electron');

  hoverCheckInterval = setInterval(() => {
    if (!overlayWindow || !isOverlayEnabled) return;

    const cursorPos = screen.getCursorScreenPoint();
    const overlayBounds = overlayWindow.getBounds();

    // Check if cursor is within or near the overlay (with 20px margin)
    const margin = 20;
    const nearOverlay =
      cursorPos.x >= overlayBounds.x - margin &&
      cursorPos.x <= overlayBounds.x + overlayBounds.width + margin &&
      cursorPos.y >= overlayBounds.y - margin &&
      cursorPos.y <= overlayBounds.y + overlayBounds.height + margin;

    if (nearOverlay !== isHovering) {
      isHovering = nearOverlay;
      if (overlayWindow && overlayWindow.webContents) {
        overlayWindow.webContents.send('hover-changed', isHovering);
      }
    }
  }, 100); // Check every 100ms
}

function stopHoverDetection() {
  if (hoverCheckInterval) {
    clearInterval(hoverCheckInterval);
    hoverCheckInterval = null;
  }
}

function updateOverlayWithSettings() {
  if (overlayWindow && overlayWindow.webContents) {
    overlayWindow.webContents.send('settings-updated', settings);

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const size = settings.size || 200;
    const windowSize = Math.round(size * WINDOW_PADDING_MULTIPLIER);

    // Calculate position
    let x, y;
    if (settings.position && settings.position.custom) {
      // Use custom position, but ensure it stays on screen
      x = Math.max(0, Math.min(settings.position.custom.x, screenWidth - windowSize));
      y = Math.max(0, Math.min(settings.position.custom.y, screenHeight - windowSize));
    } else {
      // Use anchor preset
      const anchor = settings.position?.anchor || 'top-right';
      const pos = getPositionForAnchor(anchor, windowSize, screenWidth, screenHeight);
      x = pos.x;
      y = pos.y;
    }

    overlayWindow.setBounds({ x, y, width: windowSize, height: windowSize });
  }

  // Update dragging state based on lock setting
  updateOverlayDraggingState();
}

app.whenReady().then(async () => {
  // Remove default menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  // Load settings
  settings = loadSettings();

  // Sync auto-launch with settings
  await syncAutoLaunch();

  // Check for updates
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  createTray();

  // If onboarding complete, show overlay; otherwise show onboarding
  if (settings.onboardingComplete) {
    createOverlayWindow();
  } else {
    createOnboardingWindow();
  }
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  stopHoverDetection();
});

app.on('second-instance', () => {
  if (configureWindow) {
    if (configureWindow.isMinimized()) configureWindow.restore();
    configureWindow.focus();
  } else if (onboardingWindow) {
    if (onboardingWindow.isMinimized()) onboardingWindow.restore();
    onboardingWindow.focus();
  }
});

// IPC handlers
ipcMain.handle('window-close', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w && !w.isDestroyed()) w.close();
});

ipcMain.handle('get-overlay-enabled', () => isOverlayEnabled);
ipcMain.handle('set-overlay-enabled', (event, enabled) => {
  isOverlayEnabled = enabled;
  updateTrayMenu();
  toggleOverlay();
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-onboarding', (event, onboardingSettings) => {
  settings = { ...settings, ...onboardingSettings };
  saveSettings(settings);

  // Close onboarding window
  if (onboardingWindow) {
    onboardingWindow.close();
    onboardingWindow = null;
  }

  // Create overlay if not exists
  if (!overlayWindow) {
    createOverlayWindow();
  } else {
    updateOverlayWithSettings();
  }

  // Open configure window
  createConfigureWindow();

  return true;
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('skip-to-configure', () => {
  // Close buy me a coffee window
  if (onboardingWindow) {
    onboardingWindow.close();
    onboardingWindow = null;
  }

  // Open configure window
  createConfigureWindow();
});

ipcMain.handle('open-buymecoffee-and-configure', () => {
  shell.openExternal('https://buymeacoffee.com/Kojjyan');

  // Close buy me a coffee window
  if (onboardingWindow) {
    onboardingWindow.close();
    onboardingWindow = null;
  }

  // Open configure window
  createConfigureWindow();
});

ipcMain.handle('save-settings', (event, newSettings) => {
  settings = { ...settings, ...newSettings };
  saveSettings(settings);
  updateOverlayWithSettings();
  return true;
});

// Drag handlers
ipcMain.handle('drag-start', (event, { x, y }) => {
  handleOverlayDragStart(x, y);
});

ipcMain.handle('drag-move', (event, { x, y }) => {
  handleOverlayDragMove(x, y);
});

ipcMain.handle('drag-end', () => {
  handleOverlayDragEnd();
});

// Auto-start handler
ipcMain.handle('set-auto-start', async (event, enabled) => {
  settings.autoStart = enabled;
  saveSettings(settings);
  await syncAutoLaunch();
  return true;
});

// Position lock handler
ipcMain.handle('set-position-locked', (event, locked) => {
  settings.positionLocked = locked;
  saveSettings(settings);
  updateOverlayDraggingState();
  return true;
});
