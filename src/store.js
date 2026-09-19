'use strict';

const Store = require('electron-store');

const store = new Store({
  defaults: {
    box: null, // { ip, uniqueId, name, accessToken, registrationId }
    // Separate pairing from the Sync Box -- [{ ip, id, name, username,
    // clientkey }, ...]. A household can have more than one Bridge, so this
    // is a list, not a single slot. Only needed for entertainment area
    // management (see huebridge.js); the Sync Box's own /hue state covers
    // everything else this app does.
    bridges: [],
    // null = close like a normal app (fully quits). Otherwise one of
    // 'close-to-tray' | 'minimize-to-tray'.
    trayBehavior: null,
    launchOnLogin: false,
    // Local-only display overrides for Hue entertainment areas ("WHERE"),
    // keyed by group id: { name, icon }. The Sync Box API doesn't expose a
    // way to rename an entertainment area (that's managed via the Hue
    // Bridge/app) or associate an icon with one, so this is purely a
    // cosmetic override inside this app, not pushed to the device.
    groupOverrides: {},
  },
});

// 'tray-only' was a removed setting -- a machine that had it selected while
// that UI option still existed would otherwise be stuck permanently hidden
// (window launches hidden, skipTaskbar stays on, minimize/close still hide
// to tray) with no way to turn it off, since the settings screen no longer
// offers a checkbox that matches this stored value at all.
if (store.get('trayBehavior') === 'tray-only') {
  store.set('trayBehavior', null);
}

// Migrate the old single-bridge slot (this app originally only supported
// pairing one Hue Bridge, which turned out to be a real bug for anyone with
// more than one) into the new list.
if (store.has('bridge')) {
  const legacy = store.get('bridge');
  if (legacy) store.set('bridges', [...store.get('bridges'), legacy]);
  store.delete('bridge');
}

module.exports = store;
