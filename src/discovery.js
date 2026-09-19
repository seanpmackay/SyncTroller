// Finds Hue Sync Box(es) on the LAN via mDNS. Shells out to avahi-browse
// (present on every machine this app targets) rather than adding an mDNS
// npm dependency, matching the same approach already used for ADB device
// discovery elsewhere in this setup.
'use strict';

const { execFile } = require('child_process');

/**
 * Returns an array of { ip, uniqueId, name } for every Sync Box found.
 * Resolves to [] if avahi-browse is missing or nothing is found.
 */
function discover(timeoutMs = 4000) {
  return new Promise((resolve) => {
    execFile(
      'avahi-browse',
      ['-r', '-t', '-p', '_huesync._tcp'],
      { timeout: timeoutMs },
      (err, stdout) => {
        if (!stdout) return resolve([]);
        const boxes = [];
        for (const line of stdout.split('\n')) {
          if (!line.startsWith('=')) continue;
          const fields = line.split(';');
          // =;iface;IPv4;service-name;_huesync._tcp;local;hostname;ip;port;"txt records"
          if (fields[2] !== 'IPv4') continue;
          const ip = fields[7];
          const txt = fields.slice(9).join(';');
          const uniqueIdMatch = txt.match(/uniqueid=([0-9A-Fa-f]+)/);
          const nameMatch = txt.match(/name="([^"]*)"/);
          if (ip) {
            boxes.push({
              ip,
              uniqueId: uniqueIdMatch ? uniqueIdMatch[1] : null,
              name: nameMatch ? nameMatch[1] : 'Hue Sync Box',
            });
          }
        }
        // De-duplicate (IPv4 line often appears twice: browse + resolve)
        const seen = new Set();
        resolve(boxes.filter((b) => (seen.has(b.ip) ? false : seen.add(b.ip))));
      }
    );
  });
}

module.exports = { discover };
