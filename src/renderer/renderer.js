'use strict';

// ---- App identity ----
// Single source of truth for the version shown in Settings > About, shared
// by the desktop and Android builds (this file is byte-identical in both).
// Bump APP_VERSION and add a CHANGELOG entry whenever a user-visible change
// ships; keep package.json / PKGBUILD / build.gradle in step with it.
const APP_VERSION = '1.2.1';
const APP_AUTHOR = 'RoodleSoft';
const APP_COPYRIGHT_YEAR = 2026;
const CHANGELOG = [
  {
    version: '1.2.1',
    date: '2026-09-21',
    changes: [
      'Removed the personal LinkedIn link from the About screen.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-20',
    changes: [
      'Undo the last move while placing lights, the TV, or the couch in a room.',
      'New brightness control: a vertical fill that grows out of its own button.',
      'The 3D room now fits the window; zoom with a pinch or Ctrl + scroll.',
      'Forget/Delete actions use one consistent full-width style everywhere.',
      'Added this About screen.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-09-19',
    changes: [
      'Android: finds every Sync Box and Hue Bridge on the network, not just the first.',
      'Android: the back gesture steps up one screen at a time instead of leaving the app.',
      'Android: persistent sync-status notification for quick access from the shade.',
      'Larger settings button and a cleaner main-screen layout.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-09-18',
    changes: [
      'Initial release: pair with a Hue Play HDMI Sync Box and toggle sync.',
      'Switch mode, intensity, brightness, and HDMI input.',
      'Pair a Hue Bridge and create or edit entertainment areas with 3D light placement.',
      'Desktop: system-tray controls, close/minimize to tray, launch on login.',
    ],
  },
];


const views = {
  pairing: document.getElementById('view-pairing'),
  presslink: document.getElementById('view-presslink'),
  main: document.getElementById('view-main'),
  settings: document.getElementById('view-settings'),
  bridgePairing: document.getElementById('view-bridge-pairing'),
  bridgePresslink: document.getElementById('view-bridge-presslink'),
  bridgeDetail: document.getElementById('view-bridge-detail'),
  entareas: document.getElementById('view-entareas'),
  entareaEdit: document.getElementById('view-entarea-edit'),
  lightPlacement: document.getElementById('view-light-placement'),
  about: document.getElementById('view-about'),
};

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove('active'));
  views[name].classList.add('active');
}

// ---- Title bar ----
document.getElementById('btn-minimize').addEventListener('click', () => window.hueSync.minimizeWindow());
document.getElementById('btn-close').addEventListener('click', () => window.hueSync.closeWindow());
document.getElementById('btn-settings').addEventListener('click', () => {
  loadSettingsView();
  showView('settings');
});
document.getElementById('btn-settings-back').addEventListener('click', () => {
  showView('main');
  refreshState();
});

// ---- About ----
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatReleaseDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderAbout() {
  document.querySelectorAll('.about-version').forEach((el) => { el.textContent = APP_VERSION; });
  document.querySelectorAll('.about-year').forEach((el) => { el.textContent = String(APP_COPYRIGHT_YEAR); });
  const list = document.getElementById('about-changelog');
  list.innerHTML = CHANGELOG.map((release, i) => `
    <div class="about-release${i === 0 ? ' about-release-current' : ''}">
      <div class="about-release-head">
        <span class="about-release-version">${escapeHtml(release.version)}</span>
        ${i === 0 ? '<span class="about-release-badge">Current</span>' : ''}
        <span class="about-release-date">${escapeHtml(formatReleaseDate(release.date))}</span>
      </div>
      <ul class="about-release-list">
        ${release.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>
    </div>`).join('');
}

// The row's version label is filled once at load so it's right the first
// time the settings screen opens, not only after About has been visited.
renderAbout();

document.getElementById('btn-about').addEventListener('click', () => {
  renderAbout();
  views.about.scrollTop = 0; // hidden views keep their scroll offset; always open at the top
  showView('about');
});
document.getElementById('btn-about-back').addEventListener('click', () => showView('settings'));

// Icons are proper inline SVG (see icons.js) rather than emoji -- emoji
// glyphs render inconsistently (missing/ugly fallback shapes) depending on
// the system's installed emoji font.
const MODE_META = {
  video: { icon: 'tv', label: 'Video' },
  game: { icon: 'gamepad', label: 'Game' },
  music: { icon: 'music', label: 'Music' },
};

const INTENSITY_META = {
  subtle: { icon: waveIcon(1, false), label: 'Subtle' },
  moderate: { icon: waveIcon(2, false), label: 'Moderate' },
  high: { icon: waveIcon(3, false), label: 'High' },
  intense: { icon: waveIcon(3, true), label: 'Intense' },
};

// ---------------- Pairing flow ----------------

let pendingBox = null;

async function runDiscovery() {
  const statusEl = document.getElementById('pairing-status');
  const listEl = document.getElementById('pairing-list');
  statusEl.textContent = 'Searching your network…';
  listEl.innerHTML = '';
  const boxes = await window.hueSync.discoverBoxes();
  if (!boxes.length) {
    statusEl.textContent = 'No Sync Box found automatically.';
    return;
  }
  statusEl.textContent = `Found ${boxes.length} device${boxes.length > 1 ? 's' : ''}:`;
  for (const box of boxes) {
    const item = document.createElement('div');
    item.className = 'pairing-item';
    item.innerHTML = `<div><div class="pairing-item-name">${box.name}</div><div class="pairing-item-ip">${box.ip}</div></div><div>›</div>`;
    item.addEventListener('click', () => startPairing(box));
    listEl.appendChild(item);
  }
}

let pairRetryTimer = null;
let pairAttempts = 0;
const PAIR_MAX_ATTEMPTS = 60; // ~60s at 1/sec, matches the box's own pushlink window

function startPairing(box) {
  pendingBox = box;
  pairAttempts = 0;
  document.getElementById('presslink-error').textContent = '';
  document.getElementById('presslink-status').textContent = 'Waiting for button press…';
  showView('presslink');
  attemptPair();
}

function stopPairRetry() {
  if (pairRetryTimer) clearTimeout(pairRetryTimer);
  pairRetryTimer = null;
}

async function attemptPair() {
  pairAttempts += 1;
  try {
    await window.hueSync.pairBox(pendingBox);
    stopPairRetry();
    await enterMainView();
    return;
  } catch (err) {
    // "Invalid State" is expected/normal until the button is actually held
    // long enough to blink green -- the official pairing pattern is to keep
    // retrying roughly once a second rather than a single one-shot attempt.
    if (pairAttempts >= PAIR_MAX_ATTEMPTS) {
      document.getElementById('presslink-status').textContent = 'Still waiting…';
      document.getElementById('presslink-error').textContent =
        `Giving up after ${PAIR_MAX_ATTEMPTS}s (${err.message}). Hold the button until it blinks green, then try again.`;
      return;
    }
  }
  pairRetryTimer = setTimeout(attemptPair, 1000);
}

document.getElementById('btn-rescan').addEventListener('click', runDiscovery);

document.getElementById('btn-manual-connect').addEventListener('click', () => {
  const ip = document.getElementById('manual-ip').value.trim();
  if (!ip) return;
  startPairing({ ip, uniqueId: null, name: 'Sync Box' });
});

document.getElementById('btn-cancel-pair').addEventListener('click', () => {
  stopPairRetry();
  showView('pairing');
});

// ---------------- Main control view ----------------

let state = null; // last full state from the box
let groupOverrides = {}; // local WHERE display overrides, see store.js
let pollTimer = null;
let lastSyncActive = null; // tracks changes so we only notify main.js on transitions

async function enterMainView() {
  showView('main');
  groupOverrides = await window.hueSync.getGroupOverrides();
  await refreshState();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshState, 4000);
}

async function refreshState() {
  try {
    state = await window.hueSync.getState();
    renderState();
  } catch (err) {
    document.getElementById('device-status').textContent = 'Unreachable';
  }
}

function currentInput() {
  if (!state || !state.hdmi || !state.execution.hdmiSource) return null;
  return state.hdmi[state.execution.hdmiSource] || null;
}

function renderState() {
  if (!state) return;
  const { execution, device, hdmi, hue } = state;

  document.getElementById('device-name').textContent = device.name || 'Sync Box';

  const fab = document.getElementById('sync-fab');
  fab.classList.toggle('active', execution.syncActive);
  document.getElementById('input-tile').classList.toggle('syncing', execution.syncActive);

  if (execution.syncActive !== lastSyncActive) {
    lastSyncActive = execution.syncActive;
    window.hueSync.notifySyncStateChanged(execution.syncActive);
  }

  let statusText = 'Ready';
  if (execution.syncActive) statusText = 'Syncing';
  else if (execution.mode === 'passthrough') statusText = 'Ready';
  else if (execution.mode === 'powersave') statusText = 'Standby';
  document.getElementById('device-status').textContent = statusText;

  const input = currentInput();
  document.getElementById('input-tile-icon').innerHTML = input
    ? portIcon(input.type, 56)
    : svgIcon('question', 56);
  document.getElementById('what-icon').innerHTML = input ? portIcon(input.type, 20) : svgIcon('plug', 20);
  document.getElementById('what-sub').textContent = input ? input.name : 'None';
  document.getElementById('brightness-icon').innerHTML = svgIcon('sun', 18);

  const modeMeta = MODE_META[execution.mode];
  document.getElementById('mode-icon').innerHTML = svgIcon(modeMeta ? modeMeta.icon : 'dashCircle', 18);

  const activeModeState = execution[execution.mode];
  const intensity = (activeModeState && activeModeState.intensity) || 'moderate';
  document.getElementById('intensity-icon').innerHTML = (INTENSITY_META[intensity] || INTENSITY_META.moderate).icon;

  let whereName = 'None';
  let whereIconName = 'home';
  if (hue && hue.groups && execution.hueTarget) {
    const groupId = execution.hueTarget.replace(/^groups\//, '');
    const group = hue.groups[groupId];
    const override = groupOverrides[groupId];
    if (group) {
      whereName = (override && override.name) || group.name;
      whereIconName = (override && override.icon) || 'home';
    }
  }
  document.getElementById('where-sub').textContent = whereName;
  document.getElementById('where-icon').innerHTML = svgIcon(whereIconName, 20);
}

document.getElementById('sync-fab').addEventListener('click', async () => {
  await window.hueSync.setExecution({ toggleSyncActive: true });
  refreshState();
});

window.hueSync.onTrayToggleSync(async () => {
  await window.hueSync.setExecution({ toggleSyncActive: true });
  refreshState();
});

// ---------------- Bottom sheet (Mode / Intensity / What / Where / Brightness) ----------------

const sheetOverlay = document.getElementById('sheet-overlay');
const sheetTitle = document.getElementById('sheet-title');
const sheetOptions = document.getElementById('sheet-options');
const sheetSliderWrap = document.getElementById('sheet-slider-wrap');
const sheetSlider = document.getElementById('sheet-slider');

function closeSheet() {
  sheetOverlay.classList.remove('active');
}
sheetOverlay.addEventListener('click', (e) => {
  if (e.target === sheetOverlay) closeSheet();
});

// Fixed-size squares (see CSS) that wrap and center automatically --
// showLabels=false renders icon-only buttons (used by the icon picker,
// where the choices are purely decorative rather than a meaningful named
// setting like Mode/Intensity/What/Where).
function renderSheetOptions(options, selectedValue, onSelect, { showLabels = true } = {}) {
  // The brightness sheet hides this element via an inline style (see
  // pill-brightness below) -- clear it back to the CSS default (flex) or
  // every sheet after the first brightness view would stay invisible.
  sheetOptions.style.removeProperty('display');
  sheetOptions.innerHTML = '';
  for (const opt of options) {
    const el = document.createElement('div');
    el.className = 'sheet-option' + (opt.value === selectedValue ? ' selected' : '');
    el.innerHTML = showLabels
      ? `<span class="sheet-option-icon">${opt.icon}</span><span>${opt.label}</span>`
      : `<span class="sheet-option-icon">${opt.icon}</span>`;
    el.title = opt.label;
    el.addEventListener('click', async () => {
      closeSheet();
      await onSelect(opt.value);
    });
    sheetOptions.appendChild(el);
  }
}

function openOptionSheet(title, options, selectedValue, onSelect) {
  sheetTitle.textContent = title;
  sheetSliderWrap.style.display = 'none';
  renderSheetOptions(options, selectedValue, async (value) => {
    await onSelect(value);
    refreshState();
  });
  sheetOverlay.classList.add('active');
}

document.getElementById('pill-mode').addEventListener('click', () => {
  if (!state) return;
  const options = Object.entries(MODE_META).map(([value, m]) => ({ value, icon: svgIcon(m.icon, 20), label: m.label }));
  openOptionSheet('Mode', options, state.execution.mode, (mode) =>
    window.hueSync.setExecution({ mode })
  );
});

document.getElementById('pill-intensity').addEventListener('click', () => {
  if (!state) return;
  const options = Object.entries(INTENSITY_META).map(([value, m]) => ({ value, icon: m.icon, label: m.label }));
  const activeModeState = state.execution[state.execution.mode] || {};
  openOptionSheet('Intensity', options, activeModeState.intensity, (intensity) =>
    window.hueSync.setExecution({ intensity })
  );
});

document.getElementById('pill-brightness').addEventListener('click', () => {
  if (!state) return;
  sheetTitle.textContent = 'Brightness';
  sheetOptions.style.display = 'none';
  sheetSliderWrap.style.display = 'block';
  sheetSlider.value = state.execution.brightness;
  sheetOverlay.classList.add('active');
});

let brightnessDebounce = null;
function scheduleBrightnessUpdate(value) {
  clearTimeout(brightnessDebounce);
  brightnessDebounce = setTimeout(async () => {
    await window.hueSync.setExecution({ brightness: value });
    refreshState();
  }, 150);
}

sheetSlider.addEventListener('input', (e) => scheduleBrightnessUpdate(Number(e.target.value)));

// ---- Brightness pill (see .brightness-pill in style.css) ----
//
// A vertical fill-from-the-bottom pill with a floating percentage badge,
// matching the reference iOS-style brightness/volume control -- driven
// entirely by pointer events here (pointer events fire for mouse drags
// too, not just touch, which is why this replaced the plain <input
// type="range"> on both desktop and Android rather than staying an
// Android-only override). #sheet-slider (the original range input, see
// index.html, now hidden) is kept as the actual value: this only ever
// reads its .value to draw the pill, and on drag sets .value and
// dispatches a real 'input' event so scheduleBrightnessUpdate() above
// fires exactly as it always has, unchanged.
// Only used by positionPopover() below now, to actually size the sheet --
// render() used to also assume the pill's rendered height always exactly
// equals this constant (computing the fill/badge in pixels from it), which
// didn't reliably hold in practice (confirmed live: the fill visibly fell
// short of the pill's real top edge even at 100%). render() now sizes both
// in CSS percent/max() instead, which is correct against whatever the
// pill's real height renders as, with no assumption needed at all.
// Reference pairing this aspect ratio is tuned against: Android's own
// #pill-brightness (a fixed 122px square, see .control-pill in
// android.css) at this height read well there, confirmed live -- kept
// as its own pair of constants (not read off the anchor) so the ratio
// stays fixed even though the actual target width below can be smaller.
const BRIGHTNESS_REF_WIDTH = 122;
const BRIGHTNESS_REF_HEIGHT = 240;
// Floor for platforms whose own anchor renders narrower than this (e.g.
// desktop's compact oval control-pill, ~90px in the 340px window) --
// Android's 122px anchor already exceeds it, so this never touches
// Android's own sizing (Math.max(122, 100) is just 122, unchanged).
// Confirmed live 2026-09-20 that using BRIGHTNESS_REF_WIDTH itself here
// (i.e. matching Android's width exactly) made the popover feel far too
// large against desktop's much smaller window and UI -- this floor sits
// deliberately below that reference instead.
const BRIGHTNESS_POPOVER_MIN_WIDTH = 100;

(function () {
  const pill = document.getElementById('brightness-pill');
  const fill = document.getElementById('brightness-fill');
  const badge = document.getElementById('brightness-badge');
  const icon = document.getElementById('brightness-sun-icon');
  const slider = document.getElementById('sheet-slider');
  if (!pill || !slider) return;

  if (icon) icon.innerHTML = svgIcon('sun', 24);

  const MIN = Number(slider.min) || 0;
  const MAX = Number(slider.max) || 200;

  function render(value) {
    const frac = Math.min(1, Math.max(0, (value - MIN) / (MAX - MIN)));
    // A CSS percentage of .brightness-pill's own current height -- always
    // correct regardless of what that height actually renders as, with no
    // assumption needed (see style.css's comment on .brightness-fill for
    // why a fixed-resolution background image here couldn't guarantee a
    // uniformly "full" look at 100% the way a gradient does).
    fill.style.height = frac * 100 + '%';
    // Floats 14px above the fill line; never closer than 20px to the
    // bottom (near 0%). max() mixes the % and the px cleanly without
    // needing to know the pill's actual pixel height either.
    badge.style.bottom = 'max(20px, calc(' + frac * 100 + '% + 14px))';
    badge.textContent = Math.round(frac * 100) + '%';
  }

  function valueFromClientY(clientY) {
    const rect = pill.getBoundingClientRect();
    let frac = 1 - (clientY - rect.top) / rect.height;
    frac = Math.min(1, Math.max(0, frac));
    return Math.round(MIN + frac * (MAX - MIN));
  }

  function setValue(value) {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    render(value);
  }

  pill.addEventListener('pointerdown', (e) => {
    // Matches the 3D placement view's own drag handlers (ball/TV/couch) --
    // touch-action:none on the pill already stops the browser's own pan/
    // scroll gesture recognition, but preventDefault() here too rules out
    // any other default touch handling (e.g. a long-press) competing with
    // the drag, same as those.
    e.preventDefault();
    pill.setPointerCapture(e.pointerId);
    setValue(valueFromClientY(e.clientY));
    const move = (ev) => setValue(valueFromClientY(ev.clientY));
    const up = () => {
      pill.removeEventListener('pointermove', move);
      pill.removeEventListener('pointerup', up);
    };
    pill.addEventListener('pointermove', move);
    pill.addEventListener('pointerup', up);
  });

  // Touchpad/mouse-wheel scroll support on desktop -- no visible +/-
  // stepper buttons, just scroll while hovering the pill. deltaY is
  // negative when scrolling up/away (increase), positive scrolling down/
  // toward you (decrease). Lives on the pill now (not the hidden
  // #sheet-slider) since a display:none element never receives a wheel
  // event in the first place.
  pill.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = 4;
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = Math.min(MAX, Math.max(MIN, Number(slider.value) + direction * step));
      setValue(next);
    },
    { passive: false }
  );

  // Grows the sheet itself (not just the pill) up out of #pill-brightness,
  // matching the official Hue Sync app's own brightness control: it keeps
  // the button's left/width/bottom edge exactly where the button was and
  // extends upward, rather than either replacing it at the same small size
  // or floating separately above it. Setting the small (button-sized) rect
  // first with transitions off, forcing a reflow, then animating to the
  // tall rect is what makes it visibly grow instead of just appearing.
  const overlay = document.getElementById('sheet-overlay');
  const sheetBox = overlay ? overlay.querySelector('.sheet') : null;
  function positionPopover() {
    const anchorBtn = document.getElementById('pill-brightness');
    if (!anchorBtn || !sheetBox) return;
    const rect = anchorBtn.getBoundingClientRect();
    sheetBox.style.transition = 'none';
    sheetBox.style.left = Math.round(rect.left) + 'px';
    sheetBox.style.width = Math.round(rect.width) + 'px';
    sheetBox.style.top = Math.round(rect.top) + 'px';
    sheetBox.style.height = Math.round(rect.height) + 'px';
    void sheetBox.offsetHeight; // force layout before re-enabling the transition
    sheetBox.style.transition = 'top 0.18s ease, height 0.18s ease, left 0.18s ease, width 0.18s ease';
    // #pill-brightness's own width varies a lot by platform (a narrow oval
    // on desktop's compact control-row vs. a much wider square on Android's
    // full-width one, see .control-pill) -- widening to a fixed comfortable
    // width here, centered on the button's own horizontal center rather
    // than staying flush-left at whatever the button's real width happens
    // to be, is what keeps the slider a consistent, comfortably-sized shape
    // on both instead of desktop's ending up an oddly narrow vertical
    // strip. Height then scales with whatever that target width ends up
    // being, at the same ratio as the reference pairing above, rather than
    // a flat height constant -- on Android, where the anchor's own width
    // already equals BRIGHTNESS_REF_WIDTH, this comes out to exactly
    // BRIGHTNESS_REF_HEIGHT (unchanged); on desktop's narrower window it
    // shrinks both dimensions together instead of leaving a now-too-tall
    // slider above a smaller-than-before width.
    const targetWidth = Math.max(rect.width, BRIGHTNESS_POPOVER_MIN_WIDTH);
    const targetHeight = targetWidth * (BRIGHTNESS_REF_HEIGHT / BRIGHTNESS_REF_WIDTH);
    sheetBox.style.left = Math.round(rect.left + rect.width / 2 - targetWidth / 2) + 'px';
    sheetBox.style.width = Math.round(targetWidth) + 'px';
    sheetBox.style.top = Math.round(rect.bottom - targetHeight) + 'px';
    sheetBox.style.height = Math.round(targetHeight) + 'px';
  }

  // The brightness pill/sheet toggle above sets sheetSlider.value and
  // sheetSliderWrap.style.display = 'block' (in that order) each time the
  // Brightness sheet is opened, and back to 'none' when a different sheet
  // type (Mode/Intensity/...) opens instead -- watching the wrap's own
  // style attribute is a reliable hook both to redraw the pill from that
  // freshly-set value and to swap the whole sheet between "grows out of
  // its own button" (brightness) and the normal full-width bottom sheet
  // (everything else). positionPopover() runs first: render() sizes the
  // fill/badge in CSS percent/max() against the pill's own real rendered
  // height rather than a fixed constant, so ordering isn't strictly
  // required for correctness, but doing the resize before the redraw
  // still reads more naturally.
  const wrap = document.getElementById('sheet-slider-wrap');
  new MutationObserver(() => {
    const isBrightness = wrap.style.display === 'block';
    if (overlay) overlay.classList.toggle('brightness-popover', isBrightness);
    if (isBrightness) {
      positionPopover();
      render(Number(slider.value));
    } else if (sheetBox) {
      // positionPopover() sets left/top/width/height/transition as inline
      // styles, which beat *any* CSS rule (including the base .sheet rules
      // Mode/Intensity/What/Where rely on) regardless of the
      // .brightness-popover class being removed -- without clearing them
      // back out here, every sheet after the first time brightness was
      // opened this session stayed stuck at whatever small size/position
      // brightness last used instead of its own normal full-width layout.
      sheetBox.style.left = '';
      sheetBox.style.top = '';
      sheetBox.style.width = '';
      sheetBox.style.height = '';
      sheetBox.style.transition = '';
    }
  }).observe(wrap, { attributes: true, attributeFilter: ['style'] });
})();

document.getElementById('btn-what').addEventListener('click', () => {
  if (!state || !state.hdmi) return;
  const options = ['input1', 'input2', 'input3', 'input4']
    .filter((key) => state.hdmi[key])
    .map((key) => ({
      value: key,
      icon: portIcon(state.hdmi[key].type, 20),
      label: state.hdmi[key].name,
    }));
  openOptionSheet('What are you watching?', options, state.execution.hdmiSource, (hdmiSource) =>
    window.hueSync.setExecution({ hdmiSource })
  );
});

document.getElementById('btn-where').addEventListener('click', () => {
  if (!state || !state.hue || !state.hue.groups) return;
  const entries = Object.entries(state.hue.groups);
  // execution.hueTarget (e.g. "groups/<id>") is the actual sync destination
  // -- /hue/groups/{id} with active:true looked like the right endpoint from
  // the data model's docstrings, but the box rejected it with "Invalid
  // Value"; hueTarget via the same /execution endpoint mode/intensity/
  // brightness already use is what the real app is understood to change.
  const currentId = state.execution.hueTarget
    ? state.execution.hueTarget.replace(/^groups\//, '')
    : null;
  const options = entries.map(([id, g]) => {
    const override = groupOverrides[id];
    return {
      value: id,
      icon: svgIcon((override && override.icon) || 'home', 20),
      label: (override && override.name) || g.name,
    };
  });
  openOptionSheet('Where?', options, currentId, (groupId) =>
    window.hueSync.setExecution({ hueTarget: `groups/${groupId}` })
  );
});

// ---------------- Settings view ----------------

async function loadSettingsView() {
  const settings = await window.hueSync.getSettings();
  groupOverrides = settings.groupOverrides || {};
  document.querySelectorAll('.tray-option').forEach((el) => {
    el.checked = el.dataset.value === settings.trayBehavior;
  });
  document.getElementById('launch-on-login-toggle').checked = settings.launchOnLogin;
  const box = settings.box;
  document.getElementById('settings-box-info').textContent = box
    ? `${box.name} — ${box.ip}`
    : 'Not paired';
  renderBridgeSettings(settings.bridges || []);

  renderInputSettings();
  renderGroupSettings(settings.groupOverrides || {});
}

// Tray options behave like a toggleable radio group: clicking the already
// -checked one turns it off (trayBehavior -> null, meaning "close like a
// normal app"), clicking a different one switches to it exclusively.
document.querySelectorAll('.tray-option').forEach((el) => {
  el.addEventListener('click', (e) => {
    const clicked = e.target;
    const wasChecked = clicked.dataset.wasChecked === 'true';
    document.querySelectorAll('.tray-option').forEach((other) => {
      other.checked = other === clicked && !wasChecked;
      other.dataset.wasChecked = other.checked ? 'true' : 'false';
    });
    const selected = document.querySelector('.tray-option:checked');
    window.hueSync.setTrayBehavior(selected ? selected.dataset.value : null);
  });
});

document.getElementById('launch-on-login-toggle').addEventListener('change', (e) =>
  window.hueSync.setLaunchOnLogin(e.target.checked)
);

document.getElementById('btn-forget-box').addEventListener('click', async () => {
  const confirmed = await confirmDialog('Forget this Sync Box?', 'You’ll need to pair it again to control it from this app.', 'Forget');
  if (!confirmed) return;
  if (pollTimer) clearInterval(pollTimer);
  await window.hueSync.forgetBox();
  showView('pairing');
  runDiscovery();
});

// ---------------- Hue Bridge pairing (entertainment areas) ----------------
//
// More than one Bridge can be paired (a household can have more than one),
// so settings shows a list of paired bridges rather than a single slot, and
// pairing is always reachable regardless of how many are already paired.

let pendingBridge = null;
let bridges = []; // all paired bridges: [{ ip, id, name, username, clientkey }]
let currentBridge = null; // the bridge currently open in the detail/entareas/edit/placement flow

function renderBridgeSettings(list) {
  bridges = list;
  const container = document.getElementById('settings-bridges-list');
  container.innerHTML = '';
  for (const bridge of list) {
    const row = document.createElement('div');
    row.className = 'settings-item-row';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <div class="settings-item-icon-btn">${svgIcon('hub', 18)}</div>
      <div class="bridge-row-info" style="flex:1">
        <div class="bridge-row-name" style="font-weight:600; font-size:13px"></div>
        <div class="muted small"></div>
      </div>
    `;
    const nameEl = row.querySelector('.bridge-row-name');
    nameEl.textContent = bridge.name || 'Hue Bridge';
    row.querySelector('.bridge-row-info .muted').textContent = bridge.ip;
    row.addEventListener('click', () => openBridgeDetail(bridge));
    container.appendChild(row);

    // A bridge paired before this app stored a name (or migrated from the
    // old single-bridge slot, which never had one at all) shows "Hue
    // Bridge" above -- quietly fetch and persist its real name so this
    // self-heals without the user having to forget/re-pair.
    if (!bridge.name) {
      window.hueSync.refreshBridgeName(bridge.ip).then((updated) => {
        nameEl.textContent = updated.name;
        bridges = bridges.map((b) => (b.ip === bridge.ip ? updated : b));
      });
    }
  }
}

function openBridgeDetail(bridge) {
  currentBridge = bridge;
  document.getElementById('bridge-detail-title').textContent = bridge.name || 'Hue Bridge';
  document.getElementById('bridge-detail-ip').textContent = bridge.ip;
  showView('bridgeDetail');
}

document.getElementById('btn-bridge-detail-back').addEventListener('click', () => showView('settings'));

document.getElementById('btn-bridge-detail-manage').addEventListener('click', () => {
  showView('entareas');
  loadEntareasList();
});

document.getElementById('btn-bridge-detail-forget').addEventListener('click', async () => {
  const confirmed = await confirmDialog('Forget this Bridge?', 'You’ll need to pair it again to manage its entertainment areas.', 'Forget');
  if (!confirmed) return;
  await window.hueSync.forgetBridge(currentBridge.ip);
  showView('settings');
  loadSettingsView();
});

async function runBridgeDiscovery() {
  const statusEl = document.getElementById('bridge-pairing-status');
  const listEl = document.getElementById('bridge-pairing-list');
  statusEl.textContent = 'Searching your network…';
  listEl.innerHTML = '';
  const bridges = await window.hueSync.discoverBridges();
  if (!bridges.length) {
    statusEl.textContent = 'No Hue Bridge found automatically.';
    return;
  }
  statusEl.textContent = `Found ${bridges.length} device${bridges.length > 1 ? 's' : ''}:`;
  for (const bridge of bridges) {
    const item = document.createElement('div');
    item.className = 'pairing-item';
    item.innerHTML = `<div><div class="pairing-item-name">${bridge.name}</div><div class="pairing-item-ip">${bridge.ip}</div></div><div>›</div>`;
    item.addEventListener('click', () => startBridgePairing(bridge));
    listEl.appendChild(item);
  }
}

let bridgePairRetryTimer = null;
let bridgePairAttempts = 0;
const BRIDGE_PAIR_MAX_ATTEMPTS = 30; // Bridge's own pushlink window is ~30s

function startBridgePairing(bridge) {
  pendingBridge = bridge;
  bridgePairAttempts = 0;
  document.getElementById('bridge-presslink-error').textContent = '';
  document.getElementById('bridge-presslink-status').textContent = 'Waiting for button press…';
  showView('bridgePresslink');
  attemptBridgePair();
}

function stopBridgePairRetry() {
  if (bridgePairRetryTimer) clearTimeout(bridgePairRetryTimer);
  bridgePairRetryTimer = null;
}

async function attemptBridgePair() {
  bridgePairAttempts += 1;
  try {
    await window.hueSync.pairBridge(pendingBridge);
    stopBridgePairRetry();
    loadSettingsView();
    showView('settings');
    return;
  } catch (err) {
    if (bridgePairAttempts >= BRIDGE_PAIR_MAX_ATTEMPTS) {
      document.getElementById('bridge-presslink-status').textContent = 'Still waiting…';
      document.getElementById('bridge-presslink-error').textContent =
        `Giving up after ${BRIDGE_PAIR_MAX_ATTEMPTS}s (${err.message}). Press the button, then try again.`;
      return;
    }
  }
  bridgePairRetryTimer = setTimeout(attemptBridgePair, 1000);
}

document.getElementById('btn-pair-bridge').addEventListener('click', () => {
  showView('bridgePairing');
  runBridgeDiscovery();
});
document.getElementById('btn-bridge-rescan').addEventListener('click', runBridgeDiscovery);
document.getElementById('btn-bridge-pairing-back').addEventListener('click', () => showView('settings'));
document.getElementById('btn-bridge-manual-connect').addEventListener('click', () => {
  const ip = document.getElementById('bridge-manual-ip').value.trim();
  if (!ip) return;
  startBridgePairing({ ip, id: null });
});
document.getElementById('btn-bridge-cancel-pair').addEventListener('click', () => {
  stopBridgePairRetry();
  showView('bridgePairing');
});

// ---------------- Entertainment area management ----------------

let bridgeLights = []; // [{ serviceId, lightId, name }] -- every entertainment-capable light on the Bridge
// entareaDraft.lightsById: { [serviceId]: { name, position:{x,y,z}, included } } -- keeping every
// light's entry (not just the included ones) means toggling a light off and back on remembers
// where it was, instead of resetting to a default position.
let entareaDraft = null;

const LIGHT_COLORS = [
  '#4facfe', '#ff6f91', '#9d50ff', '#ffb347', '#5ee7a0', '#ff5f57', '#5ac8fa', '#e8d44d',
  '#ff8fd1', '#7cffb2', '#c792ff', '#ffa07a', '#6ee7e7', '#ffd166', '#a3ff5e', '#ff6ec7',
]; // 16 before repeating -- a household with more lights than that in one area will start reusing colors
// Stable color-index order for included lights, shared between the toggle
// list highlight, the placement room, and the legend.
function includedLights() {
  return Object.entries(entareaDraft.lightsById)
    .filter(([, l]) => l.included)
    .map(([serviceId, l]) => ({ serviceId, ...l }));
}
function lightColor(index) {
  return LIGHT_COLORS[index % LIGHT_COLORS.length];
}

// Spreads N items across a roughly-square grid in [-0.9, 0.9] on both axes
// -- used so lights that have never been individually placed don't all
// start stacked exactly on top of each other (which visually looks like
// most of them are just missing, since only the topmost one paints).
function gridPosition(index, total) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: cols > 1 ? -0.9 + (col / (cols - 1)) * 1.8 : 0,
    y: 0.6,
    z: rows > 1 ? -0.9 + (row / (rows - 1)) * 1.8 : 0,
  };
}

// Existing areas saved under the earlier "add one at a time" flow could
// easily end up with several lights all left at the exact same default
// position (never dragged individually) -- in the room they'd render
// perfectly on top of one another, so only one ball would ever be visible
// per overlapping group ("some lights are hidden"). Regrouping any exact
// duplicates onto a grid on load fixes this without disturbing positions
// the user actually placed by hand.
function deoverlapPositions(lightsById) {
  const groups = new Map();
  for (const [id, l] of Object.entries(lightsById)) {
    if (!l.included) continue;
    const key = [l.position.x, l.position.y, l.position.z].map((n) => n.toFixed(3)).join(',');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  for (const ids of groups.values()) {
    if (ids.length <= 1) continue;
    ids.forEach((id, i) => {
      const spread = gridPosition(i, ids.length);
      lightsById[id].position.x = spread.x;
      lightsById[id].position.z = spread.z;
    });
  }
}

document.getElementById('btn-entareas-back').addEventListener('click', () => showView('bridgeDetail'));

async function loadEntareasList() {
  const listEl = document.getElementById('entareas-list');
  const emptyEl = document.getElementById('entareas-empty');
  listEl.innerHTML = '';
  const [configs, lights] = await Promise.all([
    window.hueSync.getEntertainmentConfigs(currentBridge.ip),
    window.hueSync.getBridgeLights(currentBridge.ip),
  ]);
  bridgeLights = lights;
  emptyEl.style.display = configs.length ? 'none' : 'block';
  for (const config of configs) {
    const count = config.locations.service_locations.length;
    const row = document.createElement('div');
    row.className = 'settings-item-row';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <div class="settings-item-icon-btn">${svgIcon('tv', 18)}</div>
      <div style="flex:1">
        <div style="font-weight:600; font-size:13px">${config.metadata.name}</div>
        <div class="muted small">${count} light${count === 1 ? '' : 's'}</div>
      </div>
    `;
    row.addEventListener('click', () => openEntareaEdit(config));
    listEl.appendChild(row);
  }
}

document.getElementById('btn-entarea-new').addEventListener('click', () => {
  openEntareaEdit(null);
});

let entareaRooms = []; // [{ id, name, lights: [{serviceId,lightId,deviceId,name}] }] -- Bridge Rooms with >=1 entertainment-capable light
let entareaLightsView = 'rooms'; // 'rooms' | 'lights' -- which panel the Lights section is showing
let entareaCurrentRoom = null;
let entareaSnapshot = ''; // JSON snapshot at open/save time, for the unsaved-changes warning
let roomLayoutSnapshot = ''; // JSON snapshot of roomLayout (TV/couch) at open/save time -- see btn-entarea-save/-close

function snapshotEntarea() {
  const lights = includedLights()
    .map((l) => ({ serviceId: l.serviceId, position: l.position }))
    .sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  return JSON.stringify({ name: entareaDraft.name, lights });
}

function entareaDirty() {
  return snapshotEntarea() !== entareaSnapshot;
}

async function openEntareaEdit(config) {
  const [lights, rooms] = await Promise.all([
    window.hueSync.getBridgeLights(currentBridge.ip),
    window.hueSync.getBridgeRooms(currentBridge.ip),
  ]);
  bridgeLights = lights;
  entareaRooms = rooms;
  entareaLightsView = 'rooms';
  entareaCurrentRoom = null;

  const lightsById = {};
  bridgeLights.forEach((l, i) => {
    lightsById[l.serviceId] = { name: l.name, lightId: l.lightId, position: gridPosition(i, bridgeLights.length), included: false };
  });
  if (config) {
    for (const sl of config.locations.service_locations) {
      const entry = lightsById[sl.service.rid] || { name: 'Unknown light', position: { x: 0, y: 0.6, z: 0 } };
      entry.included = true;
      entry.position = sl.positions[0];
      lightsById[sl.service.rid] = entry;
    }
    deoverlapPositions(lightsById);
  }
  entareaDraft = { id: config ? config.id : null, name: config ? config.metadata.name : '', lightsById };
  entareaSnapshot = snapshotEntarea();
  roomLayoutSnapshot = JSON.stringify(roomLayout);
  renderEntareaEdit();
  showView('entareaEdit');
}

function renderEntareaEdit() {
  document.getElementById('entarea-edit-title').textContent = entareaDraft.id ? 'Edit area' : 'New area';
  document.getElementById('entarea-name-input').value = entareaDraft.name;
  document.getElementById('btn-entarea-delete').style.display = entareaDraft.id ? 'block' : 'none';
  renderEntareaLightsPanel();
}

function pulseEl(el) {
  if (!el) return;
  el.classList.remove('pulse-identify');
  void el.offsetWidth; // restart the animation even if it's already mid-pulse
  el.classList.add('pulse-identify');
}

function lightToggleRow(serviceId, light) {
  const row = document.createElement('div');
  row.className = 'settings-item-row';
  row.style.cursor = 'pointer';
  row.innerHTML = `
    <div class="settings-item-icon-btn">${svgIcon('bulb', 18)}</div>
    <div style="flex:1; font-size:13px">${light.name}</div>
    <label class="switch">
      <input type="checkbox" ${light.included ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-thumb"></span></span>
    </label>
  `;
  const iconEl = row.querySelector('.settings-item-icon-btn');
  const checkbox = row.querySelector('input');
  checkbox.addEventListener('change', (e) => {
    entareaDraft.lightsById[serviceId].included = e.target.checked;
    if (e.target.checked) {
      pulseEl(iconEl);
      identifyLight(light.lightId);
    }
  });
  // Clicking the row (not the switch itself, which handles its own toggle)
  // just identifies the light -- same idea as clicking one in the placement
  // room's legend, so you can tell which physical light is which.
  row.addEventListener('click', (e) => {
    if (e.target.closest('.switch')) return;
    pulseEl(iconEl);
    identifyLight(light.lightId);
  });
  return row;
}

// Briefly blinks the *physical* bulb (not just this on-screen UI) via the
// Bridge's identify action, on top of the existing pulseEl()/pulseLight()
// on-screen pulse -- so picking a light here or in the 3D placement
// room/legend gives a real-world answer to "which bulb is that", not just a
// UI highlight. Optional-chained since this method may not exist on every
// platform's window.hueSync (Android's services.js has it; best-effort and
// silently a no-op anywhere it doesn't).
function identifyLight(lightId) {
  if (!lightId || !currentBridge) return;
  window.hueSync.identifyLight?.(currentBridge.ip, lightId);
}

// Bridge Rooms are shown first as a drill-down (tap a room to see just its
// lights) since scanning one flat list of every light in the house gets
// unwieldy fast. Households that haven't organized any Rooms on the Bridge
// (only Zones, or nothing at all) fall back to the flat list so this never
// dead-ends with nothing to pick from.
function renderEntareaLightsPanel() {
  const backBtn = document.getElementById('btn-entarea-lights-back');
  const titleEl = document.getElementById('entarea-lights-title');
  const list = document.getElementById('entarea-lights-list');
  const emptyEl = document.getElementById('entarea-lights-empty');
  list.innerHTML = '';

  const showFlatList = entareaRooms.length === 0;

  if (showFlatList || entareaLightsView === 'lights') {
    const entries = showFlatList
      ? Object.entries(entareaDraft.lightsById)
      : entareaCurrentRoom.lights.map((l) => [l.serviceId, entareaDraft.lightsById[l.serviceId]]);
    backBtn.style.display = showFlatList ? 'none' : 'block';
    titleEl.textContent = showFlatList ? 'Lights' : entareaCurrentRoom.name;
    emptyEl.style.display = entries.length ? 'none' : 'block';
    for (const [serviceId, light] of entries) {
      list.appendChild(lightToggleRow(serviceId, light));
    }
  } else {
    backBtn.style.display = 'none';
    titleEl.textContent = 'Rooms';
    emptyEl.style.display = entareaRooms.length ? 'none' : 'block';
    for (const room of entareaRooms) {
      const includedCount = room.lights.filter((l) => entareaDraft.lightsById[l.serviceId]?.included).length;
      const row = document.createElement('div');
      row.className = 'settings-item-row';
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <div class="settings-item-icon-btn">${svgIcon('home', 18)}</div>
        <div style="flex:1">
          <div style="font-weight:600; font-size:13px">${room.name}</div>
          <div class="muted small">${includedCount} of ${room.lights.length} light${room.lights.length === 1 ? '' : 's'} included</div>
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" style="fill:var(--text-dimmer)"><path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
      `;
      row.addEventListener('click', () => {
        entareaCurrentRoom = room;
        entareaLightsView = 'lights';
        renderEntareaLightsPanel();
      });
      list.appendChild(row);
    }
  }
}

document.getElementById('btn-entarea-lights-back').addEventListener('click', () => {
  entareaLightsView = 'rooms';
  entareaCurrentRoom = null;
  renderEntareaLightsPanel();
});

document.getElementById('entarea-name-input').addEventListener('input', (e) => {
  entareaDraft.name = e.target.value;
});

document.getElementById('btn-entarea-edit-close').addEventListener('click', async () => {
  if (entareaDirty()) {
    const discard = await confirmDialog('Discard changes?', 'This entertainment area has unsaved changes.');
    if (!discard) return;
  }
  // Any TV/couch move this edit session only ever lived in memory (see
  // their own drag up() handlers) -- closing without hitting Save reverts
  // it back to whatever was last actually persisted, the same as an
  // unsaved light/name change never reaching the Bridge.
  if (roomLayoutSnapshot) roomLayout = JSON.parse(roomLayoutSnapshot);
  showView('entareas');
});

document.getElementById('btn-entarea-save').addEventListener('click', async () => {
  const name = entareaDraft.name.trim() || 'Entertainment area';
  const lightsPayload = includedLights().map((l) => ({ serviceId: l.serviceId, position: l.position }));
  if (entareaDraft.id) {
    await window.hueSync.updateEntertainmentConfig(currentBridge.ip, entareaDraft.id, name, lightsPayload);
  } else {
    await window.hueSync.createEntertainmentConfig(currentBridge.ip, name, lightsPayload);
  }
  // Commits this session's TV/couch position (if it changed) alongside the
  // area's own name/lights -- see the drag handlers' own comments for why
  // this doesn't already happen immediately on drag.
  saveRoomLayout();
  roomLayoutSnapshot = JSON.stringify(roomLayout);
  showView('entareas');
  loadEntareasList();
});

document.getElementById('btn-entarea-delete').addEventListener('click', async () => {
  await window.hueSync.deleteEntertainmentConfig(currentBridge.ip, entareaDraft.id);
  showView('entareas');
  loadEntareasList();
});

// ---------------- Generic confirm dialog ----------------

function confirmDialog(title, message, confirmLabel = 'Discard') {
  return new Promise((resolve) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const overlay = document.getElementById('confirm-overlay');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    okBtn.textContent = confirmLabel;
    overlay.classList.add('active');
    const cleanup = (result) => {
      overlay.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ---------------- Light placement ----------------
//
// A real 3D room (see the .room3d-wrap CSS comment): each light is an
// independent object positioned by translate3d(x,y,z) in the same 3D space
// as the wall and floor. Dragging a light's ball moves it along the floor
// (x and z together, in one gesture -- no location/height mode switch);
// scrolling over it raises or lowers it (y) instead.
// These, and the TV/WALL constants further below, all scale together with
// every pixel value in the .room3d-* CSS (see style.css) as one unit --
// every relationship between them (documented at each spot) holds at any
// size as long as every one of these numbers and every matching CSS value
// carries the same scale factor.
const ROOM_HALF_WIDTH = 176; // px, matches .room3d-back-wall / .room3d-floor width (352) / 2
const ROOM_HALF_DEPTH = 144; // px, matches the translateZ(-144px) walls/floor share
const ROOM_FLOOR_Y = 96; // px below the stage's vertical center -- matches .room3d-back-wall's -96px margin-top
const ROOM_HEIGHT = 192; // px floor-to-ceiling, matches .room3d-back-wall's height
const ROOM_BALL_MARGIN = 22.4; // px -- keeps the ball's edge (not just its center) clear of the floor/ceiling
// Ball-center travel: y=0 sits just off the floor, y=1 sits just under the
// ceiling -- not 0..ROOM_HEIGHT, which would let the ball clip through
// both, and not some fraction of it either, which was the earlier bug
// (max height topped out well short of the ceiling instead of visibly
// reaching it).
function lightHeightPx(yNorm) {
  return ROOM_BALL_MARGIN + yNorm * (ROOM_HEIGHT - 2 * ROOM_BALL_MARGIN);
}

// ---- Camera orbit ----
//
// Dragging empty room background (not a light/TV/couch, which stop this
// via stopPropagation) orbits the view around the room instead of moving
// anything -- this is what lets you actually see the couch's backrest vs.
// its open seat, or check a light's position from a different angle.
// Existing drag math for lights/TV/couch stays screen-bounding-box-relative
// (see their handlers) rather than properly unprojecting through the
// current camera angle -- exact under the default view, an intentional
// approximation once rotated, which is fine for a spatial reference tool
// like this one.
const ROOM_DEFAULT_PITCH = -24;
let cameraYaw = 0;
let cameraPitch = ROOM_DEFAULT_PITCH;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.8;
// null until first computed (see defaultRoomZoom() below, near roomWrapEl)
// -- lets a fresh session start fit-to-window on any screen size while
// still letting cameraZoom persist across placement-view visits
// afterward, same as cameraYaw/cameraPitch above.
let cameraZoom = null;

// Each ball is a flat disc, not a real sphere -- without correction it
// goes edge-on (shrinks to an invisible sliver) at some rotation angles.
// Counter-rotating the ball by the camera's own angle keeps it always
// facing the viewer ("billboarding"), same trick as game engine particle
// sprites. Applied to the ball itself (not its .room3d-light-ball-offset
// parent, which still needs its own translateY untouched by this to keep
// positioning height correctly) so orientation and position stay
// independent. The couch/TV deliberately do NOT get this -- seeing them
// from the side/back on purpose is the point of being able to rotate.
function applyBallBillboard(ball) {
  ball.style.transform = `rotateY(${-cameraYaw}deg) rotateX(${-cameraPitch}deg)`;
}

function updateCameraTransform() {
  const t = `scale(${cameraZoom ?? 1}) rotateX(${cameraPitch}deg) rotateY(${cameraYaw}deg)`;
  document.querySelector('#view-light-placement .room3d-stage').style.transform = t;
  document.getElementById('room3d-objects-stage').style.transform = t;
  document.getElementById('room3d-lights-stage').style.transform = t;
  document.querySelectorAll('#view-light-placement .room3d-light-ball').forEach(applyBallBillboard);
}

function resetRoomView() {
  cameraYaw = 0;
  cameraPitch = ROOM_DEFAULT_PITCH;
  cameraZoom = defaultRoomZoom();
  updateCameraTransform();
}

const btnRoomResetView = document.getElementById('btn-room-reset-view');
btnRoomResetView.addEventListener('pointerdown', (e) => e.stopPropagation());
btnRoomResetView.addEventListener('click', resetRoomView);

// ---- Undo (single-level, covers the TV/couch/light-position drags below) ----
//
// Only one step deep -- this is a safety net for "oops, that drag was
// actually an accidental click", not a full history. Session-wide revert
// still exists separately via the entertainment area's Discard/close (see
// btn-entarea-edit-close), which this doesn't replace.
let lastMove = null; // { restore: fn }
const btnRoomUndo = document.getElementById('btn-room-undo');

function clearUndo() {
  lastMove = null;
  btnRoomUndo.style.display = 'none';
}

function recordMove(restore) {
  lastMove = { restore };
  btnRoomUndo.style.display = 'flex';
}

btnRoomUndo.addEventListener('pointerdown', (e) => e.stopPropagation());
btnRoomUndo.addEventListener('click', () => {
  if (!lastMove) return;
  lastMove.restore();
  clearUndo();
});

const roomWrapEl = document.getElementById('room3d-wrap');

// The room's actual 3D content (.room3d-stage etc.) is a fixed
// ROOM_HALF_WIDTH*2 px square regardless of room3d-wrap's own (responsive)
// width -- on a narrower window (desktop's fixed 340px, vs. Android's
// full, wider device width) than that fixed size, it would otherwise
// overflow past the wrap's edges and get cropped by its overflow:hidden,
// reading as "zoomed in" next to a wide-enough window where it was never
// cropped in the first place. Shrinking to fit -- never magnifying past 1
// just because the window happens to be wide enough already -- reproduces
// Android's own uncropped default look on any window size. Callers must
// run this only once room3d-wrap is actually visible (a hidden ancestor
// reports 0 width), which is why resetRoomView() and the placement-view
// open handler both call this only after showView('lightPlacement').
function defaultRoomZoom() {
  const wrapWidth = roomWrapEl.getBoundingClientRect().width;
  if (!wrapWidth) return 1;
  return Math.min(1, wrapWidth / (ROOM_HALF_WIDTH * 2));
}

// ---- Orbit (1 finger/pointer) and pinch-to-zoom (2) ----
//
// A single pointer orbits the view (unchanged from before); a second
// pointer landing while the first is still down switches to a two-finger
// pinch instead, scaling cameraZoom by how much the distance between the
// two touches has changed since the pinch started. Listeners are
// persistent (not added/removed per-gesture, unlike the light/TV/couch
// drag handlers) because a pinch can start or end mid-gesture as fingers
// land/lift, which per-gesture listeners can't express as cleanly.
// Ending a gesture always means lifting every finger first, then starting
// fresh -- no attempt to hand a 2-finger pinch back into a 1-finger orbit
// mid-gesture without lifting, which would need its own re-anchoring
// logic for comparatively little benefit. A third+ finger is ignored
// entirely; whatever gesture (pinch, at that point) is already active
// just keeps tracking its original two points.
const activeRoomPointers = new Map(); // pointerId -> {x, y}
let orbitStart = null; // { x, y, yaw, pitch }
let pinchStart = null; // { dist, zoom }

function pointerDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

roomWrapEl.addEventListener('pointerdown', (e) => {
  roomWrapEl.setPointerCapture(e.pointerId);
  activeRoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = [...activeRoomPointers.values()];

  if (pts.length === 2) {
    orbitStart = null;
    pinchStart = { dist: pointerDist(pts[0], pts[1]) || 1, zoom: cameraZoom ?? 1 };
  } else if (pts.length === 1) {
    pinchStart = null;
    orbitStart = { x: e.clientX, y: e.clientY, yaw: cameraYaw, pitch: cameraPitch };
  }
});

roomWrapEl.addEventListener('pointermove', (e) => {
  if (!activeRoomPointers.has(e.pointerId)) return;
  activeRoomPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinchStart) {
    const pts = [...activeRoomPointers.values()];
    if (pts.length < 2) return;
    const dist = pointerDist(pts[0], pts[1]);
    cameraZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStart.zoom * (dist / pinchStart.dist)));
    updateCameraTransform();
  } else if (orbitStart) {
    cameraYaw = orbitStart.yaw + (e.clientX - orbitStart.x) * 0.4;
    cameraPitch = Math.min(-5, Math.max(-80, orbitStart.pitch - (e.clientY - orbitStart.y) * 0.4));
    updateCameraTransform();
  }
});

function endRoomPointer(e) {
  activeRoomPointers.delete(e.pointerId);
  if (activeRoomPointers.size < 2) pinchStart = null;
  if (activeRoomPointers.size === 0) orbitStart = null;
}
roomWrapEl.addEventListener('pointerup', endRoomPointer);
roomWrapEl.addEventListener('pointercancel', endRoomPointer);

// Desktop equivalent of pinch: holding Ctrl while scrolling (a real mouse
// wheel) or a trackpad pinch gesture (Chromium synthesizes these as wheel
// events with ctrlKey set, unrelated to whether the physical Ctrl key is
// actually held -- a long-standing browser convention, not something
// specific to this app). Kept as a separate listener rather than folded
// into the light-height one below so each stays a single, simple
// responsibility; that one explicitly ignores ctrlKey wheel events so the
// two never both act on the same scroll.
roomWrapEl.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    cameraZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (cameraZoom ?? 1) * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    updateCameraTransform();
  },
  { passive: false }
);

// ---- Room layout (TV + couch position) ----
//
// Not part of any entertainment area's data -- this is a one-time "where's
// my actual furniture" reference shared across every area, so it's kept
// locally (not sent to the Bridge) and persisted across sessions.
const ROOM_LAYOUT_KEY = 'synctroller-room-layout';
// TV centered on the wall (x/y both 0); couch centered (x:0) and pulled
// back almost to the rear wall (z close to -1, the floor's back edge) but
// not flush against it, leaving walking-room between them by default.
const DEFAULT_ROOM_LAYOUT = { tv: { x: 0, y: 0 }, couch: { x: 0, z: -0.7 } };

function loadRoomLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROOM_LAYOUT_KEY));
    // 'x'/'y' (px on the wall) replaced an earlier 'left'/'top' (% of the
    // wall) format from when the TV was still nested inside the wall div
    // instead of being its own object -- fall back to the default rather
    // than mis-positioning it from stale percentages.
    if (saved && saved.tv && 'x' in saved.tv && 'y' in saved.tv && saved.couch) return saved;
  } catch {
    // corrupt/missing -- fall through to defaults
  }
  return JSON.parse(JSON.stringify(DEFAULT_ROOM_LAYOUT));
}

function saveRoomLayout() {
  try {
    localStorage.setItem(ROOM_LAYOUT_KEY, JSON.stringify(roomLayout));
  } catch {
    // best-effort only -- a private/blocked storage context just means the
    // layout resets next time, not worth surfacing to the user
  }
}

let roomLayout = loadRoomLayout();

// ---- TV (draggable on the wall) ----
//
// An independent 3D object on the lights-stage, same pattern as a light or
// the couch -- NOT nested inside .room3d-back-wall (see the HTML/CSS
// comments): a light nested in the floor and this TV nested in the wall
// turned out to be the same underlying bug, just discovered a session
// apart -- the browser doesn't reliably depth-sort against a plane (the
// floor; the side walls) that spans a wide range of its own depth.
const TV_HALF_WIDTH = 108.8; // px, half of .room3d-tv's 217.6px width
const TV_HALF_HEIGHT = 61.2; // px, half of 217.6 * 9/16
const WALL_HALF_WIDTH = 176; // px, matches .room3d-back-wall
const WALL_HALF_HEIGHT = 96; // px, matches .room3d-back-wall
const TV_WALL_Z = -140.8; // px, just in front of the wall's own -144 depth

const roomTvEl = document.querySelector('#view-light-placement .room3d-tv');

function applyTvPosition() {
  const { x, y } = roomLayout.tv;
  roomTvEl.style.transform = `translate3d(${x}px, ${y}px, ${TV_WALL_Z}px) translate(-50%, -50%)`;
}
applyTvPosition();

// Requires a first tap to select the TV (see the matching light-ball
// comment above) before a second pointerdown actually starts dragging it --
// otherwise a drag meant to orbit the room that happens to start on the TV
// nudges it instead. Deselects again once a move finishes (unlike a light,
// which stays selected afterward for the height control) since there's
// nothing else on this screen that needs the TV to stay "current".
roomTvEl.addEventListener('pointerdown', (e) => {
  if (!roomTvEl.classList.contains('selected')) {
    roomTvEl.classList.add('selected');
    return;
  }
  e.stopPropagation();
  e.preventDefault();
  roomTvEl.setPointerCapture(e.pointerId);
  const before = { x: roomLayout.tv.x, y: roomLayout.tv.y };
  const wall = document.querySelector('#view-light-placement .room3d-back-wall');
  const move = (ev) => {
    const rect = wall.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
    const xLimit = WALL_HALF_WIDTH - TV_HALF_WIDTH;
    const yLimit = WALL_HALF_HEIGHT - TV_HALF_HEIGHT;
    roomLayout.tv.x = Math.min(xLimit, Math.max(-xLimit, (fx - 0.5) * WALL_HALF_WIDTH * 2));
    roomLayout.tv.y = Math.min(yLimit, Math.max(-yLimit, (fy - 0.5) * WALL_HALF_HEIGHT * 2));
    applyTvPosition();
  };
  const up = () => {
    roomTvEl.removeEventListener('pointermove', move);
    roomTvEl.removeEventListener('pointerup', up);
    roomTvEl.classList.remove('selected');
    // Not saveRoomLayout() -- persisting only happens on the entertainment
    // area's own Save button now (see btn-entarea-save), same as its name/
    // light changes; closing without saving reverts this in memory (see
    // btn-entarea-edit-close) instead of the old behavior of writing to
    // localStorage immediately on every drag regardless of Save/Discard.
    if (roomLayout.tv.x !== before.x || roomLayout.tv.y !== before.y) {
      recordMove(() => {
        roomLayout.tv.x = before.x;
        roomLayout.tv.y = before.y;
        applyTvPosition();
      });
    }
  };
  roomTvEl.addEventListener('pointermove', move);
  roomTvEl.addEventListener('pointerup', up);
});

// ---- Couch (a real 3D object, draggable on the floor) ----

// Module-level (not just a closure inside ensureCouchEl()) so ensureCouchEl
// can re-sync the couch's position every time it's called, not only the
// first time it creates the element -- needed now that roomLayout.couch
// can also change *without* a drag (a reverted-on-close edit session, see
// btn-entarea-edit-close), which the early-return below wouldn't otherwise
// ever repaint.
function setCouchTransform() {
  const couch = document.querySelector('#room3d-objects-stage .room3d-couch');
  if (!couch) return;
  const x = roomLayout.couch.x * ROOM_HALF_WIDTH;
  const z = roomLayout.couch.z * ROOM_HALF_DEPTH;
  couch.style.transform = `translate3d(${x}px, ${ROOM_FLOOR_Y}px, ${z}px)`;
}

function ensureCouchEl() {
  let couch = document.querySelector('#room3d-objects-stage .room3d-couch');
  if (couch) {
    setCouchTransform();
    return couch;
  }

  couch = document.createElement('div');
  couch.className = 'room3d-couch';
  couch.innerHTML = `
    <div class="room3d-couch-seat"></div>
    <div class="room3d-couch-backrest"></div>
    <div class="room3d-couch-armrest room3d-couch-armrest-left"></div>
    <div class="room3d-couch-armrest room3d-couch-armrest-right"></div>
  `;
  document.getElementById('room3d-objects-stage').appendChild(couch);
  setCouchTransform();

  const floor = document.getElementById('room3d-floor');
  // Same tap-to-select-before-move pattern as the lights/TV (see their own
  // comments) -- a first pointerdown just selects the couch instead of
  // immediately dragging it, so a room-orbit drag that happens to start on
  // it doesn't nudge it instead.
  couch.addEventListener('pointerdown', (e) => {
    if (!couch.classList.contains('selected')) {
      couch.classList.add('selected');
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    couch.setPointerCapture(e.pointerId);
    const before = { x: roomLayout.couch.x, z: roomLayout.couch.z };
    const move = (ev) => {
      const rect = floor.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const fy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      roomLayout.couch.x = fx * 2 - 1;
      roomLayout.couch.z = fy * 2 - 1;
      setCouchTransform();
    };
    const up = () => {
      couch.removeEventListener('pointermove', move);
      couch.removeEventListener('pointerup', up);
      couch.classList.remove('selected');
      // See the TV's own up() comment -- persisting is gated behind the
      // entertainment area's Save button now, not immediate on every drag.
      if (roomLayout.couch.x !== before.x || roomLayout.couch.z !== before.z) {
        recordMove(() => {
          roomLayout.couch.x = before.x;
          roomLayout.couch.z = before.z;
          setCouchTransform();
        });
      }
    };
    couch.addEventListener('pointermove', move);
    couch.addEventListener('pointerup', up);
  });

  return couch;
}

document.getElementById('btn-entarea-placement').addEventListener('click', () => {
  // Before anything else -- room3d-wrap must actually be visible for
  // defaultRoomZoom() below to measure a real (non-zero) width.
  showView('lightPlacement');
  // Only computed once per session (persists across visits after that,
  // same as cameraYaw/cameraPitch); see defaultRoomZoom()'s own comment.
  if (cameraZoom === null) cameraZoom = defaultRoomZoom();
  updateCameraTransform();
  // Re-syncs the TV to the current roomLayout.tv every time this view is
  // entered (applyTvPosition() otherwise only ran once at page load and on
  // each drag move) -- needed now that roomLayout.tv can also change
  // *without* a drag (a reverted-on-close edit session, see
  // btn-entarea-edit-close), which would otherwise never get repainted.
  applyTvPosition();
  ensureCouchEl();
  renderPlacementRoom();
});

document.getElementById('btn-placement-done').addEventListener('click', () => showView('entareaEdit'));

function pulseLight(index) {
  const ball = document.querySelector(`.room3d-light[data-index="${index}"] .room3d-light-ball`);
  if (!ball) return;
  ball.classList.remove('pulse-identify');
  // Force reflow so re-adding the class restarts the animation even if it's
  // already mid-pulse from a previous click.
  void ball.offsetWidth;
  ball.classList.add('pulse-identify');
}

function setCurrentLight(index) {
  document.querySelectorAll('.placement-legend-item').forEach((el) => el.classList.remove('current'));
  document.querySelectorAll('.room3d-light-ball').forEach((el) => el.classList.remove('current'));
  const legendItem = document.querySelector(`.placement-legend-item[data-index="${index}"]`);
  const ball = document.querySelector(`.room3d-light[data-index="${index}"] .room3d-light-ball`);
  if (legendItem) legendItem.classList.add('current');
  if (ball) ball.classList.add('current');
  pulseLight(index);
  const light = includedLights()[index];
  if (light) identifyLight(light.lightId);
}

// Height is adjusted by scrolling over a light's ball -- but the ball
// physically moves (in 3D) as its height changes, so if the wheel listener
// lived only on the ball itself, a stationary mouse would stop being "over"
// it after a few notches and further scrolling would silently do nothing
// (reported bug: height seemed capped at whatever it started at). Instead
// one listener on the whole stage does its own hit-testing each event, and
// "locks" onto whichever light you last actually scrolled for ~700ms so it
// keeps responding even once the ball has visually drifted out from under
// the cursor.
let wheelLock = null; // { index }
let wheelLockTimer = null;

function armWheelLock(entry) {
  wheelLock = entry;
  clearTimeout(wheelLockTimer);
  wheelLockTimer = setTimeout(() => {
    wheelLock = null;
  }, 700);
}

function renderPlacementRoom() {
  const floor = document.getElementById('room3d-floor');
  const stage = document.getElementById('room3d-lights-stage');
  stage.querySelectorAll('.room3d-light').forEach((el) => el.remove());
  wheelLock = null;
  // Lights are rebuilt fresh below, so any undo recorded against the
  // previous set of light objects (or a stale TV/couch position from before
  // this view was entered) would restore the wrong thing.
  clearUndo();

  const lights = includedLights();
  lights.forEach((light, index) => {
    const anchor = document.createElement('div');
    anchor.className = 'room3d-light';
    anchor.dataset.index = String(index);

    const setAnchorTransform = () => {
      const x = light.position.x * ROOM_HALF_WIDTH;
      const z = light.position.z * ROOM_HALF_DEPTH;
      anchor.style.transform = `translate3d(${x}px, ${ROOM_FLOOR_Y}px, ${z}px)`;
    };
    setAnchorTransform();

    const pole = document.createElement('div');
    pole.className = 'room3d-light-pole';
    const ballOffset = document.createElement('div');
    ballOffset.className = 'room3d-light-ball-offset';
    const ball = document.createElement('div');
    ball.className = 'room3d-light-ball';
    // A gloss highlight over the flat color reads as a lit sphere/orb
    // instead of a flat colored disc.
    ball.style.background = `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), rgba(255,255,255,0) 55%), ${lightColor(index)}`;
    ball.dataset.index = String(index);
    applyBallBillboard(ball);

    const setHeight = () => {
      const heightPx = lightHeightPx(light.position.y);
      pole.style.height = `${heightPx}px`;
      ballOffset.style.transform = `translateY(${-heightPx}px)`;
    };
    setHeight();

    ball.addEventListener('pointerdown', (e) => {
      // A light must already be the selected/current one before a
      // pointerdown on it starts moving it -- otherwise a drag meant to
      // orbit the room (see roomWrapEl's own pointerdown below) that
      // happens to start on top of a light nudges the light instead, since
      // stopPropagation() here was swallowing that pointerdown before the
      // room ever saw it. Not stopping propagation on this first,
      // selecting tap lets both happen: the light is selected AND the
      // same gesture still reaches the room to orbit it if the user
      // continues dragging.
      if (!ball.classList.contains('current')) {
        setCurrentLight(index);
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      ball.setPointerCapture(e.pointerId);

      const before = { x: light.position.x, z: light.position.z };
      const move = (ev) => {
        const rect = floor.getBoundingClientRect();
        const fx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        const fy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
        light.position.x = fx * 2 - 1;
        light.position.z = fy * 2 - 1;
        setAnchorTransform();
      };
      const up = () => {
        ball.removeEventListener('pointermove', move);
        ball.removeEventListener('pointerup', up);
        if (light.position.x !== before.x || light.position.z !== before.z) {
          recordMove(() => {
            light.position.x = before.x;
            light.position.z = before.z;
            setAnchorTransform();
          });
        }
      };
      ball.addEventListener('pointermove', move);
      ball.addEventListener('pointerup', up);
    });

    anchor.appendChild(pole);
    ballOffset.appendChild(ball);
    anchor.appendChild(ballOffset);
    stage.appendChild(anchor);
  });

  renderPlacementLegend(lights);
}

document.getElementById('room3d-wrap').addEventListener(
  'wheel',
  (e) => {
    // A ctrlKey wheel event is the pinch-to-zoom gesture (see roomWrapEl's
    // own wheel listener) -- never light height, even while hovering a
    // ball.
    if (e.ctrlKey) return;
    const ballEl = e.target.closest('.room3d-light-ball');
    let index = ballEl ? Number(ballEl.dataset.index) : wheelLock ? wheelLock.index : null;
    if (index === null) return;
    e.preventDefault();
    const light = includedLights()[index];
    if (!light) return;
    const step = 0.05;
    light.position.y = Math.min(1, Math.max(0, light.position.y + (e.deltaY < 0 ? step : -step)));
    const anchor = document.querySelector(`.room3d-light[data-index="${index}"]`);
    const pole = anchor.querySelector('.room3d-light-pole');
    const ballOffset = anchor.querySelector('.room3d-light-ball-offset');
    const heightPx = lightHeightPx(light.position.y);
    pole.style.height = `${heightPx}px`;
    ballOffset.style.transform = `translateY(${-heightPx}px)`;
    armWheelLock({ index });
  },
  { passive: false }
);

function renderPlacementLegend(lights) {
  const legend = document.getElementById('placement-legend');
  legend.innerHTML = '';
  lights.forEach((light, index) => {
    const item = document.createElement('div');
    item.className = 'placement-legend-item';
    item.dataset.index = String(index);
    item.innerHTML = `<span class="placement-legend-swatch" style="background:${lightColor(index)}"></span><span>${light.name}</span>`;
    item.addEventListener('click', () => setCurrentLight(index));
    legend.appendChild(item);
  });
}

// ---- Input (WHAT) customization ----

function iconPickerSheet(currentIconName, onPick) {
  const iconNames = [...new Set(Object.values(PORT_ICON_NAMES))];
  const sheetOpts = iconNames.map((name) => ({ value: name, icon: svgIcon(name, 22), label: name }));
  openOptionSheetRaw('Choose an icon', sheetOpts, currentIconName, onPick, { showLabels: false });
}

// Like openOptionSheet, but doesn't call refreshState() afterward (used for
// local settings, not device state).
function openOptionSheetRaw(title, options, selectedValue, onSelect, opts) {
  sheetTitle.textContent = title;
  sheetSliderWrap.style.display = 'none';
  renderSheetOptions(options, selectedValue, onSelect, opts);
  sheetOverlay.classList.add('active');
}

function renderInputSettings() {
  const container = document.getElementById('settings-inputs-list');
  container.innerHTML = '';
  if (!state || !state.hdmi) return;
  for (const key of ['input1', 'input2', 'input3', 'input4']) {
    const input = state.hdmi[key];
    if (!input) continue;
    const row = document.createElement('div');
    row.className = 'settings-item-row';
    const iconName = PORT_ICON_NAMES[input.type] || 'plug';
    row.innerHTML = `
      <button class="settings-item-icon-btn" data-key="${key}">${svgIcon(iconName, 18)}</button>
      <input type="text" data-key="${key}" value="${input.name.replace(/"/g, '&quot;')}" />
    `;
    const iconBtn = row.querySelector('.settings-item-icon-btn');
    iconBtn.addEventListener('click', () => {
      iconPickerSheet(iconName, async (pickedIconName) => {
        // Reverse-map the chosen icon back to a representative PortType so
        // the device's own `type` field stays meaningful, not just cosmetic.
        const type = Object.keys(PORT_ICON_NAMES).find((t) => PORT_ICON_NAMES[t] === pickedIconName) || 'generic';
        await window.hueSync.renameInput(key, undefined, type);
        await refreshState();
        loadSettingsView();
      });
    });
    const textInput = row.querySelector('input[type="text"]');
    textInput.addEventListener('change', async () => {
      await window.hueSync.renameInput(key, textInput.value, undefined);
      await refreshState();
    });
    container.appendChild(row);
  }
}

// ---- WHERE (entertainment area) customization (local display only) ----

function renderGroupSettings(overrides) {
  const container = document.getElementById('settings-groups-list');
  container.innerHTML = '';
  if (!state || !state.hue || !state.hue.groups) return;
  for (const [groupId, group] of Object.entries(state.hue.groups)) {
    const override = overrides[groupId] || {};
    const displayName = override.name || group.name;
    const iconName = override.icon || 'home';
    const row = document.createElement('div');
    row.className = 'settings-item-row';
    row.innerHTML = `
      <button class="settings-item-icon-btn" data-id="${groupId}">${svgIcon(iconName, 18)}</button>
      <input type="text" data-id="${groupId}" value="${displayName.replace(/"/g, '&quot;')}" />
    `;
    const iconBtn = row.querySelector('.settings-item-icon-btn');
    iconBtn.addEventListener('click', () => {
      const iconNames = ['home', 'tv', 'gamepad', 'music', 'speaker', 'sun'];
      const opts = iconNames.map((name) => ({ value: name, icon: svgIcon(name, 22), label: name }));
      openOptionSheetRaw(
        'Choose an icon',
        opts,
        iconName,
        async (pickedIconName) => {
          await window.hueSync.setGroupOverride(groupId, displayName, pickedIconName);
          loadSettingsView();
        },
        { showLabels: false }
      );
    });
    const textInput = row.querySelector('input[type="text"]');
    textInput.addEventListener('change', async () => {
      await window.hueSync.setGroupOverride(groupId, textInput.value, iconName);
      loadSettingsView();
    });
    container.appendChild(row);
  }
}

// ---------------- Boot ----------------

(async function init() {
  const settings = await window.hueSync.getSettings();
  if (settings.box) {
    await enterMainView();
  } else {
    showView('pairing');
    runDiscovery();
  }
})();
