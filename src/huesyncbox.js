// Client for the Philips Hue Play HDMI Sync Box local API, reverse-engineered
// from github.com/mvdwetering/aiohuesyncbox (the library Home Assistant's own
// official integration uses). No official public API docs exist from Philips.
//
// Base URL: https://{host}:443/api/v1{path}. Self-signed cert -- verification
// is disabled here rather than pinning the device's own CA, since this only
// ever talks to a device already identified by IP on the local network.
'use strict';

const https = require('https');

class HueSyncBoxError extends Error {}

function request(host, path, { method = 'GET', body, accessToken } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      {
        host,
        port: 443,
        path: `/api/v1${path}`,
        method,
        headers,
        rejectUnauthorized: false,
        timeout: 10000,
      },
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
            const msg = json && json.message ? json.message : `HTTP ${res.statusCode}`;
            reject(new HueSyncBoxError(msg));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new HueSyncBoxError('Request timed out')));
    req.on('error', (err) => reject(new HueSyncBoxError(err.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * One-time pairing. The user must press the physical link button on the
 * Sync Box shortly before (or hold it during) this call, same push-link
 * pattern as the Hue Bridge. Throws if the button wasn't pressed in time.
 */
async function register(host, appName, instanceName) {
  const res = await request(host, '/registrations', {
    method: 'POST',
    body: { appName, instanceName },
  });
  return { registrationId: res.registrationId, accessToken: res.accessToken };
}

async function unregister(host, accessToken, registrationId) {
  await request(host, `/registrations/${registrationId}`, {
    method: 'DELETE',
    accessToken,
  });
}

/** Full device state: device, execution, hue, hdmi, registrations, presets. */
function getState(host, accessToken) {
  return request(host, '', { accessToken });
}

/** Partial update to sync/HDMI/mode/intensity/brightness/target state. */
function setExecution(host, accessToken, update) {
  return request(host, '/execution', { method: 'PUT', accessToken, body: update });
}

function setHueGroupActive(host, accessToken, groupId, active) {
  return request(host, `/hue/groups/${groupId}`, {
    method: 'PUT',
    accessToken,
    body: { active },
  });
}

function renameHdmiInput(host, accessToken, inputKey, { name, type } = {}) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (type !== undefined) body.type = type;
  return request(host, `/hdmi/${inputKey}`, { method: 'PUT', accessToken, body });
}

function setDevice(host, accessToken, update) {
  return request(host, '/device', { method: 'PUT', accessToken, body: update });
}

module.exports = {
  HueSyncBoxError,
  register,
  unregister,
  getState,
  setExecution,
  setHueGroupActive,
  renameHdmiInput,
  setDevice,
};
