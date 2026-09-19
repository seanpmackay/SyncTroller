// Client for the Hue Bridge's local CLIP v2 API, used only for entertainment
// area (configuration_type/light membership/light position) management --
// everything else in this app talks to the Sync Box instead. This is a
// separate device/pairing from the Sync Box: the Sync Box's own /hue state
// only *reads* a summary of entertainment areas already configured on the
// Bridge, it has no API to create one or place lights in it, so managing
// that requires pairing with the Bridge directly (same push-link pattern as
// the Sync Box, but the physical button lives on the Bridge itself).
//
// Self-signed cert -- verification disabled here rather than pinning the
// bridge's own CA, same rationale as huesyncbox.js (LAN device already
// identified by IP).
'use strict';

const https = require('https');
const { execFile } = require('child_process');

class HueBridgeError extends Error {}

function rawRequest(host, path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      { host, port: 443, path, method, headers: reqHeaders, rejectUnauthorized: false, timeout: 10000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          if (data) {
            try {
              json = JSON.parse(data);
            } catch {
              // non-JSON response body, leave json null
            }
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new HueBridgeError(`HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new HueBridgeError('Request timed out')));
    req.on('error', (err) => reject(new HueBridgeError(err.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

/** CLIP v2 request against /clip/v2/resource{path}, authenticated with the app key. */
async function v2Request(host, appKey, path, { method = 'GET', body } = {}) {
  const json = await rawRequest(host, `/clip/v2/resource${path}`, {
    method,
    body,
    headers: { 'hue-application-key': appKey },
  });
  if (json && Array.isArray(json.errors) && json.errors.length) {
    throw new HueBridgeError(json.errors.map((e) => e.description).join('; '));
  }
  return (json && json.data) || [];
}

/**
 * The Bridge's own name (as set in the Hue app), available unauthenticated
 * -- used to show a real name instead of a generic placeholder both while
 * picking a bridge to pair and afterward in the paired list, since two
 * bridges in the same household otherwise look identical.
 */
async function getBridgeName(host) {
  try {
    const config = await rawRequest(host, '/api/config');
    return (config && config.name) || 'Hue Bridge';
  } catch {
    return 'Hue Bridge';
  }
}

/**
 * Finds Hue Bridge(s) on the LAN via mDNS. Shells out to avahi-browse, same
 * approach as the Sync Box discovery. Resolves to [] if avahi-browse is
 * missing or nothing is found -- the pairing UI falls back to manual IP
 * entry either way.
 */
function discover(timeoutMs = 4000) {
  return new Promise((resolve) => {
    execFile('avahi-browse', ['-r', '-t', '-p', '_hue._tcp'], { timeout: timeoutMs }, async (err, stdout) => {
      if (!stdout) return resolve([]);
      const bridges = [];
      for (const line of stdout.split('\n')) {
        if (!line.startsWith('=')) continue;
        const fields = line.split(';');
        if (fields[2] !== 'IPv4') continue;
        const ip = fields[7];
        const txt = fields.slice(9).join(';');
        const idMatch = txt.match(/bridgeid=([0-9A-Fa-f]+)/);
        if (ip) bridges.push({ ip, id: idMatch ? idMatch[1] : null });
      }
      const seen = new Set();
      const unique = bridges.filter((b) => (seen.has(b.ip) ? false : seen.add(b.ip)));
      resolve(await Promise.all(unique.map(async (b) => ({ ...b, name: await getBridgeName(b.ip) }))));
    });
  });
}

/**
 * One-time pairing. The user must press the physical link button on the
 * Bridge shortly before this call, same push-link pattern as the Sync Box.
 * The v1 /api endpoint (not CLIP v2) is what issues the app key; CLIP v2
 * then uses that same key via the hue-application-key header.
 */
async function register(host, appName, instanceName) {
  const res = await rawRequest(host, '/api', {
    method: 'POST',
    body: { devicetype: `${appName}#${instanceName}`, generateclientkey: true },
  });
  const entry = Array.isArray(res) ? res[0] : null;
  if (!entry || !entry.success) {
    const desc = entry && entry.error ? entry.error.description : 'link button not pressed';
    throw new HueBridgeError(desc);
  }
  const name = await getBridgeName(host);
  return { username: entry.success.username, clientkey: entry.success.clientkey, name };
}

function getLightDevices(host, appKey) {
  return v2Request(host, appKey, '/light');
}

function getEntertainmentServices(host, appKey) {
  return v2Request(host, appKey, '/entertainment');
}

/**
 * Entertainment-capable lights only (most Hue color lights, not every
 * accessory) -- joins the /light and /entertainment resources on their
 * shared owning device id, since a light's own resource has no direct
 * pointer to the "entertainment" service id that entertainment_configuration
 * membership actually references.
 */
async function getEntertainmentLights(host, appKey) {
  const [lights, services] = await Promise.all([
    getLightDevices(host, appKey),
    getEntertainmentServices(host, appKey),
  ]);
  const serviceByDevice = new Map(services.map((s) => [s.owner.rid, s]));
  return lights
    .filter((l) => serviceByDevice.has(l.owner.rid))
    .map((l) => ({
      serviceId: serviceByDevice.get(l.owner.rid).id,
      lightId: l.id,
      deviceId: l.owner.rid,
      name: l.metadata.name,
    }));
}

function getRooms(host, appKey) {
  return v2Request(host, appKey, '/room');
}

/**
 * Entertainment-capable lights grouped by the Bridge's own Rooms (as set up
 * in the Hue app) -- picking lights room-by-room is much faster to scan
 * than one flat list once a household has more than a handful of lights.
 * Rooms with no entertainment-capable lights are dropped rather than shown
 * as an empty dead end.
 */
async function getEntertainmentRooms(host, appKey) {
  const [rooms, lights] = await Promise.all([getRooms(host, appKey), getEntertainmentLights(host, appKey)]);
  return rooms
    .map((room) => {
      const deviceIds = new Set(room.children.filter((c) => c.rtype === 'device').map((c) => c.rid));
      return {
        id: room.id,
        name: room.metadata.name,
        lights: lights.filter((l) => deviceIds.has(l.deviceId)),
      };
    })
    .filter((room) => room.lights.length > 0);
}

function getEntertainmentConfigurations(host, appKey) {
  return v2Request(host, appKey, '/entertainment_configuration');
}

/**
 * lights: [{ serviceId, position: {x,y,z} }]. configurationType defaults to
 * "screen", matching what the Sync Box itself creates -- that's the type it
 * exposes as a syncable WHERE target.
 */
function createEntertainmentConfiguration(host, appKey, { name, lights, configurationType = 'screen' }) {
  return v2Request(host, appKey, '/entertainment_configuration', {
    method: 'POST',
    body: {
      type: 'entertainment_configuration',
      metadata: { name },
      configuration_type: configurationType,
      locations: {
        service_locations: lights.map((l) => ({
          service: { rid: l.serviceId, rtype: 'entertainment' },
          positions: [l.position],
        })),
      },
    },
  });
}

function updateEntertainmentConfiguration(host, appKey, id, { name, lights }) {
  const body = {};
  if (name !== undefined) body.metadata = { name };
  if (lights !== undefined) {
    body.locations = {
      service_locations: lights.map((l) => ({
        service: { rid: l.serviceId, rtype: 'entertainment' },
        positions: [l.position],
      })),
    };
  }
  return v2Request(host, appKey, `/entertainment_configuration/${id}`, { method: 'PUT', body });
}

function deleteEntertainmentConfiguration(host, appKey, id) {
  return v2Request(host, appKey, `/entertainment_configuration/${id}`, { method: 'DELETE' });
}

module.exports = {
  HueBridgeError,
  discover,
  getBridgeName,
  register,
  getEntertainmentLights,
  getEntertainmentRooms,
  getEntertainmentConfigurations,
  createEntertainmentConfiguration,
  updateEntertainmentConfiguration,
  deleteEntertainmentConfiguration,
};
