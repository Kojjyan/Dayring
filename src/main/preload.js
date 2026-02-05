const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dayring', {
  // Overlay controls
  getOverlayEnabled: () => ipcRenderer.invoke('get-overlay-enabled'),
  setOverlayEnabled: (enabled) => ipcRenderer.invoke('set-overlay-enabled', enabled),
  onOverlayToggle: (callback) => ipcRenderer.on('overlay-toggle', callback),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, settings) => callback(settings)),

  // Onboarding
  saveOnboarding: (settings) => ipcRenderer.invoke('save-onboarding', settings),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Buy Me a Coffee flow
  skipToConfigure: () => ipcRenderer.invoke('skip-to-configure'),
  openBuyMeCoffeeAndConfigure: () => ipcRenderer.invoke('open-buymecoffee-and-configure'),

  // Settings persistence
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Hover detection
  onHoverChanged: (callback) => ipcRenderer.on('hover-changed', (event, isHovering) => callback(isHovering)),

  // Drag support
  dragStart: (x, y) => ipcRenderer.invoke('drag-start', { x, y }),
  dragMove: (x, y) => ipcRenderer.invoke('drag-move', { x, y }),
  dragEnd: () => ipcRenderer.invoke('drag-end'),

  // Position updates
  onPositionChanged: (callback) => ipcRenderer.on('position-changed', (event, position) => callback(position)),

  // Drag mode
  onDragModeChanged: (callback) => ipcRenderer.on('drag-mode-changed', (event, enabled) => callback(enabled)),

  // Auto-start
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  // Position lock
  setPositionLocked: (locked) => ipcRenderer.invoke('set-position-locked', locked),

  // Window controls (frameless)
  closeWindow: () => ipcRenderer.invoke('window-close')
});
