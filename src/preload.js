'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hueSync', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTrayBehavior: (value) => ipcRenderer.invoke('settings:set-tray-behavior', value),
  setLaunchOnLogin: (enabled) => ipcRenderer.invoke('settings:set-launch-on-login', enabled),
  getGroupOverrides: () => ipcRenderer.invoke('settings:get-group-overrides'),
  setGroupOverride: (groupId, name, icon) =>
    ipcRenderer.invoke('settings:set-group-override', { groupId, name, icon }),

  // Window chrome
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Pairing
  discoverBoxes: () => ipcRenderer.invoke('box:discover'),
  pairBox: (box) => ipcRenderer.invoke('box:pair', box),
  forgetBox: () => ipcRenderer.invoke('box:forget'),

  // State + control
  getState: () => ipcRenderer.invoke('box:get-state'),
  setExecution: (update) => ipcRenderer.invoke('box:set-execution', update),
  setHueGroupActive: (groupId, active) =>
    ipcRenderer.invoke('box:set-hue-group-active', { groupId, active }),
  renameInput: (inputKey, name, type) =>
    ipcRenderer.invoke('box:rename-input', { inputKey, name, type }),

  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  onTrayToggleSync: (callback) => ipcRenderer.on('tray:toggle-sync', callback),
  notifySyncStateChanged: (active) => ipcRenderer.send('sync:state-changed', active),

  // Hue Bridge (entertainment area management) -- keyed by bridge ip since
  // more than one Bridge can be paired at once.
  discoverBridges: () => ipcRenderer.invoke('bridge:discover'),
  pairBridge: (bridge) => ipcRenderer.invoke('bridge:pair', bridge),
  forgetBridge: (ip) => ipcRenderer.invoke('bridge:forget', { ip }),
  refreshBridgeName: (ip) => ipcRenderer.invoke('bridge:refresh-name', { ip }),
  getBridgeLights: (ip) => ipcRenderer.invoke('bridge:get-lights', { ip }),
  getBridgeRooms: (ip) => ipcRenderer.invoke('bridge:get-rooms', { ip }),
  getEntertainmentConfigs: (ip) => ipcRenderer.invoke('bridge:get-entertainment-configs', { ip }),
  createEntertainmentConfig: (ip, name, lights) =>
    ipcRenderer.invoke('bridge:create-entertainment-config', { ip, name, lights }),
  updateEntertainmentConfig: (ip, id, name, lights) =>
    ipcRenderer.invoke('bridge:update-entertainment-config', { ip, id, name, lights }),
  deleteEntertainmentConfig: (ip, id) => ipcRenderer.invoke('bridge:delete-entertainment-config', { ip, id }),
});
