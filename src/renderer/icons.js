'use strict';

// Small inline SVG icon set (24x24, fill=currentColor) -- used instead of
// emoji throughout the UI. Emoji glyphs render inconsistently (missing/ugly
// fallback glyphs, e.g. a random package-box) depending on the system's
// installed emoji font, which doesn't fit a polished, consistent look.
const ICONS = {
  tv: '<path d="M21 3H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6l-2 3v1h10v-1l-2-3h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 12H3V5h18v10Z"/>',
  gamepad: '<path d="M17.5 6h-11C4.6 6 3 7.6 3 9.5v5C3 16.4 4.6 18 6.5 18c1.1 0 2.1-.5 2.8-1.4L11 15h2l1.7 1.6c.7.9 1.7 1.4 2.8 1.4 1.9 0 3.5-1.6 3.5-3.5v-5C21 7.6 19.4 6 17.5 6ZM10 12H8.5V13.5H7V12H5.5v-1.5H7V9h1.5v1.5H10V12Zm4.75-1.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm2.5 3a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/>',
  music: '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/>',
  phone: '<path d="M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-5 19a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm4.5-5h-9V4.5h9V16Z"/>',
  desktop: '<path d="M21 2H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h7l-1 3H7v2h10v-2h-2l-1-3h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1Zm-1 13H4V4h16v11Z"/>',
  laptop: '<path d="M4 5a2 2 0 0 0-2 2v8h20V7a2 2 0 0 0-2-2H4Zm0 2h16v6H4V7ZM1 18h22v1a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-1Z"/>',
  box: '<path d="M12 2 3 6.5V17.5L12 22l9-4.5V6.5L12 2Zm0 2.24 6.44 3.22L12 10.68 5.56 7.46 12 4.24ZM5 9.13l6 3v7.24l-6-3V9.13Zm8 10.24V12.13l6-3v7.24l-6 3Z"/>',
  cast: '<rect x="8" y="3" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="2" cy="21" r="2.2"/><circle cx="2" cy="21" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="2" cy="21" r="10.2" fill="none" stroke="currentColor" stroke-width="2"/>',
  disc: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5Zm0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z"/>',
  speaker: '<path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0 7.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/>',
  swap: '<path d="M9.5 3 5 7.5 9.5 12V9H16V6H9.5V3Zm5 9L19 16.5 14.5 21v-3H8v-3h6.5v-3Z"/>',
  satellite: '<path d="M13.6 2.3 8.4 7.5l2.1 2.1 5.2-5.2-2.1-2.1ZM2 20l4-4-2-2-4 4v2h2Zm7.6-9.9L4.1 15.6 8.4 20l5.5-5.5a7 7 0 0 0-4.3-3.4Zm10.1-2a5 5 0 0 1-1.4 4.3l-1.4-1.4a3 3 0 0 0 .8-2.6 3 3 0 0 0-2.4-2.4 3 3 0 0 0-2.6.8l-1.4-1.4a5 5 0 0 1 7 1.4 5 5 0 0 1 1.4 1.3Z"/>',
  flame: '<path d="M12 2s-1 3-3 5-3 4-3 6.5A6.5 6.5 0 0 0 12 20a6.5 6.5 0 0 0 6-9c-1 1-2.5 1.5-2.5 1.5C16 9 15 6 12 2Zm0 15.5a3 3 0 0 1-1-5.8c0 1.2.6 2 1.3 2.8.6.6 1.2 1.2 1.2 2A2.5 2.5 0 0 1 12 17.5Z"/>',
  home: '<path d="M12 3 2 12h3v8h6v-6h2v6h6v-8h3L12 3Z"/>',
  plug: '<path d="M16 7V2h-2v5h-4V2H8v5H6v4a5 5 0 0 0 4 4.9V21h4v-5.1A5 5 0 0 0 18 11V7h-2Z"/>',
  sun: '<path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0-5a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1ZM4.2 4.2a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 1 1-1.4 1.4L4.2 5.6a1 1 0 0 1 0-1.4Zm12.8 12.8a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4L17 18.4a1 1 0 0 1 0-1.4ZM2 12a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Zm18 0a1 1 0 0 1 1-1h2a1 1 0 0 1 0 2h-2a1 1 0 0 1-1-1ZM4.2 19.8a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 1 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4 0ZM17 6.6a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 1 1 1.4 1.4L18.4 6.6a1 1 0 0 1-1.4 0Z"/>',
  question: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 17h-2v-2h2Zm2.07-7.75-.9.92A2.5 2.5 0 0 0 13 14h-2v-.5a3.5 3.5 0 0 1 1-2.5l1.24-1.26A1.5 1.5 0 1 0 10.5 8.5H8.5a3.5 3.5 0 1 1 6.57 1.75Z"/>',
  dashCircle: '<circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="11.1" width="10" height="1.8" rx="0.9"/>',
  bulb: '<path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm2 17h-4v1h4v-1Zm-3 3h2a1 1 0 0 0 1-1h-4a1 1 0 0 0 1 1Z"/>',
  // A hub with satellite nodes -- stands in for the Hue Bridge (a network
  // hub the lights/sync box all pair through), distinct from the generic
  // "box" icon used for HDMI devices like Apple TV/Roku.
  hub: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="3.6" r="2"/><circle cx="12" cy="20.4" r="2"/><circle cx="3.6" cy="12" r="2"/><circle cx="20.4" cy="12" r="2"/><path d="M12 7.4v3.2M12 13.4v3.2M7.4 12h3.2M13.4 12h3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  // A room outline with a light inside -- for the "light placement" row,
  // distinct from the generic "box" (3D cube) icon.
  roomLight: '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="13" r="3"/>',
};

// Normalized wave icons for sync intensity -- one shared path shape per
// squiggle so all four levels look like one consistent family (same
// amplitude/stroke) instead of relying on font-rendered glyphs (∼〜≈⩙),
// which vary in size/shape across fonts and don't visually relate to each
// other. Squiggle count ramps 1/2/3, with "intense" reusing the 3-squiggle
// shape at a bolder stroke weight to read as the top of the scale.
const WAVE_UNIT = 'M1 12c1.2-3 2.8-3 4 0s2.8 3 4 0';
function waveIcon(count, bold) {
  const width = 6 + count * 6;
  let path = '';
  for (let i = 0; i < count; i++) {
    path += `<path d="${WAVE_UNIT}" transform="translate(${i * 8},0)"/>`;
  }
  const stroke = bold ? 2.75 : 2;
  return `<svg viewBox="0 0 ${width} 24" width="24" height="16" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round">${path}</svg>`;
}

function svgIcon(name, size = 24) {
  const paths = ICONS[name] || ICONS.question;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">${paths}</svg>`;
}

const PORT_ICON_NAMES = {
  generic: 'plug', video: 'disc', game: 'gamepad', music: 'music', xbox: 'gamepad',
  playstation: 'gamepad', nintendoswitch: 'gamepad', phone: 'phone', desktop: 'desktop',
  laptop: 'laptop', appletv: 'box', roku: 'box', shield: 'box', chromecast: 'cast',
  firetv: 'flame', diskplayer: 'disc', settopbox: 'box', satellite: 'satellite',
  avreceiver: 'speaker', soundbar: 'speaker', hdmiswitch: 'swap',
};

function portIcon(type, size) {
  return svgIcon(PORT_ICON_NAMES[type] || 'plug', size);
}
