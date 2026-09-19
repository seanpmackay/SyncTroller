'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');

const store = require('./store');
const huesyncbox = require('./huesyncbox');
const discovery = require('./discovery');
const huebridge = require('./huebridge');

// Affects the taskbar/window-switcher tooltip on Linux (otherwise shows the
// generic "electron" as the bold header line above the window title, since
// that's literally the dev-mode binary name). Confirmed fixed once actually
// packaged (`npm run dist`) -- KWin reports resourceClass=SyncTroller for
// the built AppImage, vs. the generic dev-mode binary name before.
app.setName('SyncTroller');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const TRAY_ICON = path.join(__dirname, '..', 'assets', 'tray-icon.png');
const TRAY_ICON_PULSE = path.join(__dirname, '..', 'assets', 'tray-icon-pulse.png');

// auto-launch defaults to process.execPath, which inside an AppImage is a
// per-run temp mount path (/tmp/.mount_XXXXX/...) that no longer exists by
// the next boot -- confirmed this build's runtime doesn't set the
// standard-elsewhere $APPIMAGE env var to fall back on, so "Launch on
// login" would otherwise silently install an autostart entry pointing at a
// path that's already gone. Falls back to the AppImage's real installed
// location instead when running from a mount point.
function resolveAutoLaunchPath() {
  if (process.env.APPIMAGE) return process.env.APPIMAGE;
  if (/\/\.mount_[^/]+\//.test(process.execPath)) {
    return path.join(require('os').homedir(), 'Applications', 'SyncTroller.AppImage');
  }
  return process.execPath;
}

const autoLauncher = new AutoLaunch({ name: 'SyncTroller', path: resolveAutoLaunchPath() });

const WINDOW_WIDTH = 340;
const WINDOW_HEIGHT = 600;

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    resizable: false,
    backgroundColor: '#0e0f12',
    icon: ICON,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Always launch open and visible -- only the close/minimize *behavior*
  // going forward is configurable, never the initial launch state.
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    if (store.get('trayBehavior') === 'close-to-tray') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (store.get('trayBehavior') === 'minimize-to-tray') {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// Tray icons are static image files -- "pulsing" is simulated by
// alternating between a normal and a brightened variant on an interval
// while syncing is active, driven by the renderer telling us when
// execution.syncActive changes (the main process doesn't poll the box
// itself).
let trayPulseInterval = null;
let trayPulseBright = false;

function startTrayPulse() {
  if (trayPulseInterval) return;
  trayPulseInterval = setInterval(() => {
    trayPulseBright = !trayPulseBright;
    tray.setImage(trayPulseBright ? TRAY_ICON_PULSE : TRAY_ICON);
  }, 650);
}

function stopTrayPulse() {
  if (trayPulseInterval) {
    clearInterval(trayPulseInterval);
    trayPulseInterval = null;
  }
  if (tray) tray.setImage(TRAY_ICON);
}

function createTray() {
  tray = new Tray(TRAY_ICON);
  tray.setToolTip('SyncTroller');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Toggle Sync',
      click: () => mainWindow.webContents.send('tray:toggle-sync'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // close-to-tray/minimize-to-tray keep the window from actually closing
  // normally; if we do get here (behavior is null/normal-quit, or a
  // platform without tray support) just quit rather than lingering with no
  // window and no tray.
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC: settings ----

ipcMain.handle('settings:get', () => ({
  trayBehavior: store.get('trayBehavior'),
  launchOnLogin: store.get('launchOnLogin'),
  box: store.get('box'),
  bridges: store.get('bridges'),
  groupOverrides: store.get('groupOverrides'),
}));

ipcMain.handle('settings:set-tray-behavior', (_e, value) => {
  store.set('trayBehavior', value);
  return true;
});

ipcMain.handle('settings:set-launch-on-login', async (_e, enabled) => {
  store.set('launchOnLogin', enabled);
  if (enabled) {
    await autoLauncher.enable();
  } else {
    await autoLauncher.disable();
  }
  return true;
});

// Local-only display overrides for Hue entertainment areas (name + icon) --
// see the comment on the store default for why these aren't pushed to the
// device.
ipcMain.handle('settings:get-group-overrides', () => store.get('groupOverrides'));

ipcMain.handle('settings:set-group-override', (_e, { groupId, name, icon }) => {
  const overrides = store.get('groupOverrides');
  overrides[groupId] = { name, icon };
  store.set('groupOverrides', overrides);
  return overrides;
});

// ---- IPC: window chrome (custom title bar) ----

ipcMain.on('window:minimize', () => mainWindow.minimize());
ipcMain.on('window:close', () => mainWindow.close());

// ---- IPC: Sync Box discovery + pairing ----

ipcMain.handle('box:discover', () => discovery.discover());

ipcMain.handle('box:pair', async (_e, { ip, uniqueId, name }) => {
  const { registrationId, accessToken } = await huesyncbox.register(
    ip,
    'SyncTroller',
    require('os').hostname()
  );
  const box = { ip, uniqueId, name, accessToken, registrationId };
  store.set('box', box);
  return box;
});

ipcMain.handle('box:forget', async () => {
  const box = store.get('box');
  if (box) {
    try {
      await huesyncbox.unregister(box.ip, box.accessToken, box.registrationId);
    } catch {
      // device may be offline/already forgotten the registration -- clear locally regardless
    }
  }
  store.set('box', null);
  return true;
});

// ---- IPC: Sync Box state + control ----

function currentBox() {
  const box = store.get('box');
  if (!box) throw new Error('No Sync Box paired yet.');
  return box;
}

ipcMain.handle('box:get-state', async () => {
  const box = currentBox();
  return huesyncbox.getState(box.ip, box.accessToken);
});

ipcMain.handle('box:set-execution', async (_e, update) => {
  const box = currentBox();
  return huesyncbox.setExecution(box.ip, box.accessToken, update);
});

ipcMain.handle('box:set-hue-group-active', async (_e, { groupId, active }) => {
  const box = currentBox();
  return huesyncbox.setHueGroupActive(box.ip, box.accessToken, groupId, active);
});

ipcMain.handle('box:rename-input', async (_e, { inputKey, name, type }) => {
  const box = currentBox();
  return huesyncbox.renameHdmiInput(box.ip, box.accessToken, inputKey, { name, type });
});

ipcMain.handle('shell:open-external', (_e, url) => shell.openExternal(url));

ipcMain.on('sync:state-changed', (_e, active) => {
  if (active) startTrayPulse();
  else stopTrayPulse();
});

// ---- IPC: Hue Bridge (entertainment area management) ----
//
// A household can have more than one Bridge, so these are keyed by ip
// rather than assuming a single paired device.

ipcMain.handle('bridge:discover', () => huebridge.discover());

ipcMain.handle('bridge:pair', async (_e, { ip, id }) => {
  const { username, clientkey, name } = await huebridge.register(ip, 'SyncTroller', require('os').hostname());
  const bridge = { ip, id, name, username, clientkey };
  store.set('bridges', [...store.get('bridges').filter((b) => b.ip !== ip), bridge]);
  return bridge;
});

ipcMain.handle('bridge:forget', (_e, { ip }) => {
  store.set('bridges', store.get('bridges').filter((b) => b.ip !== ip));
  return true;
});

function findBridge(ip) {
  const bridge = store.get('bridges').find((b) => b.ip === ip);
  if (!bridge) throw new Error('That Hue Bridge is no longer paired.');
  return bridge;
}

// Self-heals bridges paired before this app stored a `name` (or a legacy
// single-bridge pairing that predates the name field entirely), which would
// otherwise render as "undefined" forever since nothing else re-fetches it.
ipcMain.handle('bridge:refresh-name', async (_e, { ip }) => {
  const bridge = findBridge(ip);
  const name = await huebridge.getBridgeName(bridge.ip);
  const updated = { ...bridge, name };
  store.set('bridges', store.get('bridges').map((b) => (b.ip === ip ? updated : b)));
  return updated;
});

ipcMain.handle('bridge:get-lights', (_e, { ip }) => {
  const bridge = findBridge(ip);
  return huebridge.getEntertainmentLights(bridge.ip, bridge.username);
});

ipcMain.handle('bridge:get-rooms', (_e, { ip }) => {
  const bridge = findBridge(ip);
  return huebridge.getEntertainmentRooms(bridge.ip, bridge.username);
});

ipcMain.handle('bridge:get-entertainment-configs', (_e, { ip }) => {
  const bridge = findBridge(ip);
  return huebridge.getEntertainmentConfigurations(bridge.ip, bridge.username);
});

ipcMain.handle('bridge:create-entertainment-config', (_e, { ip, name, lights }) => {
  const bridge = findBridge(ip);
  return huebridge.createEntertainmentConfiguration(bridge.ip, bridge.username, { name, lights });
});

ipcMain.handle('bridge:update-entertainment-config', (_e, { ip, id, name, lights }) => {
  const bridge = findBridge(ip);
  return huebridge.updateEntertainmentConfiguration(bridge.ip, bridge.username, id, { name, lights });
});

ipcMain.handle('bridge:delete-entertainment-config', (_e, { ip, id }) => {
  const bridge = findBridge(ip);
  return huebridge.deleteEntertainmentConfiguration(bridge.ip, bridge.username, id);
});
