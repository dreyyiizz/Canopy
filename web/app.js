"use strict";
const $ = id => document.getElementById(id);

// ── State ────────────────────────────────────────────────────────────────────
let demo = true, busy = false, polling = false, generation = 0;
let lastSuccess = 0, current = null, key = "";
let independentMode = false, hasPendingChanges = false;

const controls = ["closeRoof", "openRoof", "applyLevel", "level",
                  "applyIndependent", "leftLevel", "rightLevel",
                  "dashClose", "dashOpen"];

// ── Toast system ─────────────────────────────────────────────────────────────
let activeLoadingToast = null;

function showToast(type, title, msg, duration = 4000) {
  const container = $("toastContainer");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.setAttribute("role", "status");

  const icons = {
    success: "✓",
    error:   "✕",
    loading: `<div class="spinner"></div>`
  };
  t.innerHTML = `
    <div class="toast-icon">${icons[type] ?? "·"}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>
    <button class="toast-dismiss" aria-label="Dismiss">×</button>`;

  t.querySelector(".toast-dismiss").onclick = () => removeToast(t);
  container.appendChild(t);

  if (duration > 0) setTimeout(() => removeToast(t), duration);
  return t;
}

function removeToast(t) {
  if (!t || !t.parentNode) return;
  t.classList.add("leaving");
  setTimeout(() => t.remove(), 210);
}

function dismissLoadingToast() {
  if (activeLoadingToast) { removeToast(activeLoadingToast); activeLoadingToast = null; }
}

// ── Network ──────────────────────────────────────────────────────────────────
async function request(method, path, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
      cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The server could not complete that request.");
    return result;
  } finally { clearTimeout(timer); }
}

// ── Controls enable/disable ───────────────────────────────────────────────────
function enableControls() {
  const ready = demo || (current && current.connected && Date.now() - lastSuccess < 8000);
  controls.forEach(id => { const el = $(id); if (el) el.disabled = busy || !ready; });
  const cb = $("connectButton"), db = $("demoButton");
  if (cb) cb.disabled = busy;
  if (db) db.disabled = busy;
}

// ── Pending slider state ──────────────────────────────────────────────────────
function pct(level) { return `${Math.round(level / 30 * 100)}%`; }

function updateDraft()      { $("draftValue").textContent      = pct(Number($("level").value));      markAsPending(); }
function updateLeftDraft()  { $("draftLeftValue").textContent  = pct(Number($("leftLevel").value));  markAsPending(); }
function updateRightDraft() { $("draftRightValue").textContent = pct(Number($("rightLevel").value)); markAsPending(); }

function markAsPending() {
  if (hasPendingChanges) return;
  hasPendingChanges = true;
  (independentMode ? $("applyIndependent") : $("applyLevel")).classList.add("pending");
}
function clearPending() {
  hasPendingChanges = false;
  $("applyLevel").classList.remove("pending");
  $("applyIndependent").classList.remove("pending");
}

// ── Mode tabs ─────────────────────────────────────────────────────────────────
function switchMode(toIndependent) {
  independentMode = toIndependent;
  $("parallelControls").classList.toggle("active", !toIndependent);
  $("independentControls").classList.toggle("active", toIndependent);
  $("parallelModeBtn").classList.toggle("active", !toIndependent);
  $("independentModeBtn").classList.toggle("active", toIndependent);
  clearPending();
}

// ── Page navigation ───────────────────────────────────────────────────────────
function navigateTo(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => {
    b.classList.toggle("active", b.dataset.page === pageId);
    b.setAttribute("aria-current", b.dataset.page === pageId ? "page" : "false");
  });
  const page = $(`page-${pageId}`);
  if (page) page.classList.add("active");
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

// ── Draw / state update ───────────────────────────────────────────────────────
function draw(state, resetDraft = false) {
  current = state;
  const known  = Number.isInteger(state.level)      && state.level      >= 0 && state.level      <= 30;
  const lKnown = Number.isInteger(state.leftLevel)  && state.leftLevel  >= 0 && state.leftLevel  <= 30;
  const rKnown = Number.isInteger(state.rightLevel) && state.rightLevel >= 0 && state.rightLevel <= 30;

  const value = known ? Math.round(state.level / 30 * 100) : null;
  const simulated = demo || state.demo;

  // ── Roof card ──
  $("percent").textContent = known ? value : "—";
  $("positionLabel").textContent = !known
    ? "Waiting for the Arduino"
    : (state.level === 0 ? "Closed target" : state.level === 30 ? "Open target" : "Partly open target")
      + (simulated ? " · demo" : "");
  $("controlValue").textContent = known ? `Control level ${state.level} / 30` : "Control level unknown";

  const leftVal  = lKnown ? state.leftLevel  : (known ? state.level : 15);
  const rightVal = rKnown ? state.rightLevel : (known ? state.level : 15);
  $("roofLeft").style.transform  = `rotate(${-(leftVal  / 30 * 65)}deg)`;
  $("roofRight").style.transform = `rotate(${  rightVal / 30 * 65 }deg)`;

  // ── Sensors ──
  const temp  = state.connected && Number.isFinite(state.temperature_c) ? state.temperature_c.toFixed(1) : "—";
  const humid = state.connected && Number.isFinite(state.humidity_pct)  ? String(Math.round(state.humidity_pct)) : "—";
  $("temperature").textContent = temp;
  $("humidity").textContent    = humid;

  // ── Dashboard mirrors ──
  const dp = $("dashPercent"), dt = $("dashTemp"), dh = $("dashHumid");
  if (dp) dp.textContent = known ? value : "—";
  if (dt) dt.textContent = temp;
  if (dh) dh.textContent = humid;

  const dc = $("dashConn"), di = $("dashConnIcon");
  if (dc) {
    dc.textContent = simulated ? "Demo" : state.connected ? "Online" : "Offline";
    dc.style.color = simulated ? "" : state.connected ? "#2d7a3c" : "#b03a2e";
  }
  if (di) {
    di.style.color = simulated ? "" : state.connected ? "#2d7a3c" : "#b03a2e";
  }

  // ── Environment page mirrors ──
  const et = $("envTemp"), eh = $("envHumid");
  if (et) et.textContent = temp;
  if (eh) eh.textContent = humid;
  const esb = $("envSensorBadge");
  if (esb) esb.textContent = simulated ? "Sample readings" : state.connected ? "DHT11 · live" : "Unavailable";

  // ── Badges / tags ──
  $("sensorBadge").textContent    = simulated ? "Sample readings" : state.connected ? "DHT11 · every 2 s" : "Unavailable";
  $("connectionBadge").textContent = simulated ? "Demo mode" : state.connected ? "Arduino online" : "Arduino offline";
  $("connectionBadge").classList.toggle("live", !simulated && state.connected);
  $("modeTag").textContent = simulated ? "SIMULATION" : state.connected ? "USB CONNECTED" : "DISCONNECTED";

  // ── Connection footer ──
  $("connectionTitle").textContent  = demo ? "Try it out first" : state.demo ? "Demo mode" : state.connected ? "Arduino connected" : "Arduino offline";
  $("connectionDetail").textContent = demo ? "Connect your Arduino when you're ready." : state.demo ? "Simulating an Arduino." : state.connected ? "USB connection active." : "Check the USB cable and COM port.";
  const sd = $("statusDot");
  if (sd) { sd.classList.toggle("live", !simulated && state.connected); sd.classList.toggle("error", !simulated && !state.connected); }
  $("connectLink").textContent = demo ? "Connect →" : "Settings →";

  // ── Sidebar status ──
  const ssd = $("sidebarDot"), ssl = $("sidebarStatus");
  if (ssd) { ssd.classList.toggle("live", !simulated && state.connected); ssd.classList.toggle("error", !simulated && !state.connected); }
  if (ssl) ssl.textContent = simulated ? "Demo mode" : state.connected ? "Arduino connected" : "Disconnected";

  // ── Settings page status ──
  const ssld = $("settingsStatusDot"), sssl = $("settingsStatusLabel");
  if (ssld) { ssld.classList.toggle("live", !simulated && state.connected); ssld.classList.toggle("error", !simulated && !state.connected); }
  if (sssl) sssl.textContent = simulated ? "Not connected — demo mode active" : state.connected ? "Arduino connected via USB" : "Arduino offline — check USB cable";

  // ── Draft reset ──
  if (resetDraft) {
    if (known)  { $("level").value      = state.level;      updateDraft(); }
    if (lKnown) { $("leftLevel").value  = state.leftLevel;  updateLeftDraft(); }
    if (rKnown) { $("rightLevel").value = state.rightLevel; updateRightDraft(); }
    clearPending();
  }
  enableControls();
}

// ── Demo mode ─────────────────────────────────────────────────────────────────
function useDemo() {
  generation++; demo = true; busy = false; lastSuccess = Date.now();
  draw({ connected: true, demo: true, level: 15, leftLevel: 15, rightLevel: 15, temperature_c: 28, humidity_pct: 65 }, true);
  setNotice("Demo mode. These controls do not move your real roof.");
}

// ── Notice bar ────────────────────────────────────────────────────────────────
function setNotice(message, error = false) {
  const el = $("notice");
  el.textContent = message;
  el.classList.toggle("error", error);
}

// ── Send parallel level ───────────────────────────────────────────────────────
async function sendLevel(level) {
  const applyBtn = $("applyLevel");
  if (busy || (applyBtn && applyBtn.disabled)) return;
  busy = true; enableControls();
  const epoch = ++generation;
  try {
    if (demo) {
      draw({ ...current, level, leftLevel: level, rightLevel: level }, true);
      setNotice(`Demo target set to ${Math.round(level / 30 * 100)}%. Your real roof has not moved.`);
      addControlEntry(
        `Roof set to ${Math.round(level / 30 * 100)}% (level ${level})`,
        "Demo mode — no hardware moved", "muted"
      );
    } else {
      activeLoadingToast = showToast("loading", "Sending to Arduino…", "", 0);
      const result = await request("POST", "/api/roof", { level });
      if (epoch !== generation) return;
      dismissLoadingToast();
      lastSuccess = Date.now(); draw(result, true);
      const msg = result.demo ? "Demo mode updated." : "Arduino accepted the target.";
      setNotice(msg);
      showToast("success", "Position updated", msg);
      addControlEntry(
        `Roof set to ${Math.round(level / 30 * 100)}% (level ${level})`,
        result.demo ? "Demo mode" : "Arduino confirmed", result.demo ? "muted" : "green"
      );
    }
  } catch (error) {
    if (epoch !== generation) return;
    dismissLoadingToast();
    setNotice(`${error.message}`, true);
    showToast("error", "Command failed", error.message);
    if (current) draw({ ...current, connected: false });
  } finally {
    if (epoch === generation) { busy = false; enableControls(); }
  }
}

// ── Send independent levels ───────────────────────────────────────────────────
async function sendIndependentLevels(leftLevel, rightLevel) {
  const applyBtn = $("applyIndependent");
  if (busy || (applyBtn && applyBtn.disabled)) return;
  busy = true; enableControls();
  const epoch = ++generation;
  try {
    if (demo) {
      const newLevel = leftLevel === rightLevel ? leftLevel : current.level;
      draw({ ...current, level: newLevel, leftLevel, rightLevel }, true);
      setNotice(`Demo: Left ${pct(leftLevel)}, Right ${pct(rightLevel)}. Your real roof has not moved.`);
      addControlEntry(
        `Left ${pct(leftLevel)} · Right ${pct(rightLevel)} (independent)`,
        "Demo mode — no hardware moved", "muted"
      );
    } else {
      activeLoadingToast = showToast("loading", "Sending to Arduino…", "", 0);
      const result = await request("POST", "/api/roof-independent", { leftLevel, rightLevel });
      if (epoch !== generation) return;
      dismissLoadingToast();
      lastSuccess = Date.now(); draw(result, true);
      const msg = result.demo ? "Demo mode updated." : "Arduino accepted independent targets.";
      setNotice(msg);
      showToast("success", "Positions updated", msg);
      addControlEntry(
        `Left ${pct(leftLevel)} · Right ${pct(rightLevel)} (independent)`,
        result.demo ? "Demo mode" : "Arduino confirmed", result.demo ? "muted" : "green"
      );
    }
  } catch (error) {
    if (epoch !== generation) return;
    dismissLoadingToast();
    setNotice(`${error.message}`, true);
    showToast("error", "Command failed", error.message);
    if (current) draw({ ...current, connected: false });
  } finally {
    if (epoch === generation) { busy = false; enableControls(); }
  }
}

// ── Status polling ────────────────────────────────────────────────────────────
async function poll() {
  enableControls();
  if (demo || polling || busy) return;
  polling = true;
  const epoch = generation;
  try {
    const result = await request("GET", "/api/status");
    if (epoch !== generation) return;
    const wasOnline = current && current.connected;
    lastSuccess = Date.now(); draw(result);
    maybeRecordEnv(result);
    if (!result.connected) {
      setNotice(result.error || "Arduino disconnected.", true);
      if (wasOnline) addControlEntry("Arduino disconnected", "Check USB cable and COM port", "amber");
    } else if (!wasOnline) {
      const msg = result.demo ? "Demo mode connected." : "Arduino connected. Roof controls are ready.";
      setNotice(msg);
      if (!result.demo) {
        showToast("success", "Arduino connected", "Ready to control your plant roof.");
        addControlEntry("Arduino connected", "USB connection established", "green");
      }
    }
  } catch (error) {
    if (epoch !== generation) return;
    if (current) draw({ ...current, connected: false });
    $("connectionBadge").textContent = "Server offline";
    $("connectionTitle").textContent = "Cannot reach server";
    $("connectionDetail").textContent = "Make sure Start-Canopy.cmd is running.";
    setNotice("Server connection lost. Make sure Start-Canopy.cmd is running.", true);
  } finally { polling = false; }
}

// ── Connection form (settings page) ──────────────────────────────────────────
function showSettings() { navigateTo("settings"); }

$("connectLink").onclick = showSettings;
$("setup") && ($("setup").onclick = showSettings);

$("connectionForm").onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const enteredKey = $("accessKey").value.trim();
  if (!enteredKey) { $("settingsError").textContent = "Enter the connection key shown in the terminal."; return; }

  generation++;
  const epoch = generation;
  key = enteredKey; demo = false; busy = true;
  enableControls();
  $("settingsError").textContent = "";
  activeLoadingToast = showToast("loading", "Connecting to Arduino…", "", 0);

  try {
    const result = await request("GET", "/api/status");
    if (epoch !== generation) return;
    dismissLoadingToast();
    lastSuccess = Date.now(); draw(result, true);
    try { sessionStorage.setItem("canopyKey", key); } catch (_) { }
    const msg = result.demo
      ? "Connected in demo mode. No real roof will move."
      : result.connected
        ? "Connected. The Arduino is ready for commands."
        : result.error || "Server reached. Waiting for Arduino USB connection.";
    setNotice(msg, !result.connected && !result.demo);
    showToast(
      result.connected || result.demo ? "success" : "error",
      result.connected || result.demo ? "Arduino connected" : "Arduino offline",
      msg
    );
    if (result.connected || result.demo) navigateTo("roof");
  } catch (error) {
    if (epoch !== generation) return;
    dismissLoadingToast();
    $("settingsError").textContent = error.message;
    showToast("error", "Failed to connect", "Check the connection key and make sure Start-Canopy.cmd is running.");
    draw({ connected: false, level: null });
  } finally {
    if (epoch === generation) { busy = false; enableControls(); }
  }
};

$("demoButton").onclick = () => {
  useDemo();
  navigateTo("roof");
};

// ── Roof / dashboard buttons ──────────────────────────────────────────────────
$("closeRoof").onclick        = () => sendLevel(0);
$("openRoof").onclick         = () => sendLevel(30);
$("dashClose") && ($("dashClose").onclick = () => sendLevel(0));
$("dashOpen")  && ($("dashOpen").onclick  = () => sendLevel(30));
$("applyLevel").onclick       = () => sendLevel(Number($("level").value));
$("applyIndependent").onclick = () => sendIndependentLevels(Number($("leftLevel").value), Number($("rightLevel").value));
$("level").oninput      = updateDraft;
$("leftLevel").oninput  = updateLeftDraft;
$("rightLevel").oninput = updateRightDraft;
$("parallelModeBtn").onclick    = () => switchMode(false);
$("independentModeBtn").onclick = () => switchMode(true);

// ── Activity logging ──────────────────────────────────────────────────────────
const MAX_CONTROL_ENTRIES = 200;
const MAX_ENV_ENTRIES     = 500;   // ~8 hrs at 1/min

const controlLog = [];
const envLog     = [];

// Restore from localStorage on load
(function loadLogs() {
  try {
    const cl = localStorage.getItem("canopy_control_log");
    if (cl) controlLog.push(...JSON.parse(cl));
    const el = localStorage.getItem("canopy_env_log");
    if (el) envLog.push(...JSON.parse(el));
  } catch (_) {}
})();

function saveLogs() {
  try {
    localStorage.setItem("canopy_control_log", JSON.stringify(controlLog.slice(-MAX_CONTROL_ENTRIES)));
    localStorage.setItem("canopy_env_log",     JSON.stringify(envLog.slice(-MAX_ENV_ENTRIES)));
  } catch (_) {}
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const pad = n => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return d.toDateString() === today.toDateString()
    ? time
    : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

function renderControlLog() {
  const list  = $("controlLogList");
  const empty = $("controlLogEmpty");
  const count = $("controlLogCount");
  if (!list) return;
  list.querySelectorAll(".log-entry").forEach(el => el.remove());
  if (controlLog.length === 0) {
    if (empty) empty.style.display = "";
    if (count) count.textContent = "0 events";
    return;
  }
  if (empty) empty.style.display = "none";
  if (count) count.textContent = `${controlLog.length} event${controlLog.length !== 1 ? "s" : ""}`;
  const frag = document.createDocumentFragment();
  for (let i = controlLog.length - 1; i >= 0; i--) {
    const e = controlLog[i];
    const row = document.createElement("div");
    row.className = "log-entry";
    row.innerHTML =
      `<span class="log-entry-dot ${e.dot || "green"}" aria-hidden="true"></span>` +
      `<div class="log-entry-body">` +
        `<div class="log-entry-label">${e.label}</div>` +
        (e.sub ? `<div class="log-entry-sub">${e.sub}</div>` : "") +
      `</div>` +
      `<span class="log-entry-time">${formatDate(e.ts)}</span>`;
    frag.appendChild(row);
  }
  list.appendChild(frag);
}

function renderEnvLog() {
  const list  = $("envLogList");
  const empty = $("envLogEmpty");
  const count = $("envLogCount");
  if (!list) return;
  list.querySelectorAll(".log-entry").forEach(el => el.remove());
  if (envLog.length === 0) {
    if (empty) empty.style.display = "";
    if (count) count.textContent = "0 readings";
    return;
  }
  if (empty) empty.style.display = "none";
  if (count) count.textContent = `${envLog.length} reading${envLog.length !== 1 ? "s" : ""}`;
  const frag = document.createDocumentFragment();
  for (let i = envLog.length - 1; i >= 0; i--) {
    const e = envLog[i];
    const hasT = e.temp  !== "—" && e.temp  != null;
    const hasH = e.humid !== "—" && e.humid != null;
    const row = document.createElement("div");
    row.className = "log-entry";
    row.innerHTML =
      `<span class="log-entry-dot teal" aria-hidden="true"></span>` +
      `<div class="log-entry-body"><div class="log-entry-values">` +
        (hasT ? `<div class="log-entry-val"><strong>${e.temp}</strong><span> °C</span></div>` : "") +
        (hasH ? `<div class="log-entry-val"><strong>${e.humid}</strong><span> %</span></div>` : "") +
        (!hasT && !hasH ? `<span class="log-entry-sub">No reading</span>` : "") +
      `</div></div>` +
      `<span class="log-entry-time">${formatDate(e.ts)}</span>`;
    frag.appendChild(row);
  }
  list.appendChild(frag);
}

function addControlEntry(label, sub, dot) {
  controlLog.push({ ts: Date.now(), label, sub: sub || "", dot: dot || "green" });
  if (controlLog.length > MAX_CONTROL_ENTRIES) controlLog.shift();
  saveLogs();
  renderControlLog();
}

// Per-minute environment sampler — called from poll() after each successful read
let lastEnvSample = 0;
function maybeRecordEnv(state) {
  if (!state) return;
  if (!state.connected && !state.demo) return;
  const now = Date.now();
  if (now - lastEnvSample < 60_000) return;
  lastEnvSample = now;
  const temp  = Number.isFinite(state.temperature_c) ? state.temperature_c.toFixed(1) : "—";
  const humid = Number.isFinite(state.humidity_pct)  ? String(Math.round(state.humidity_pct)) : "—";
  envLog.push({ ts: now, temp, humid });
  if (envLog.length > MAX_ENV_ENTRIES) envLog.shift();
  saveLogs();
  renderEnvLog();
}

// Clear all button
const clearBtn = $("clearLogsBtn");
if (clearBtn) {
  clearBtn.onclick = () => {
    controlLog.length = 0;
    envLog.length = 0;
    lastEnvSample = 0;
    try {
      localStorage.removeItem("canopy_control_log");
      localStorage.removeItem("canopy_env_log");
    } catch (_) {}
    renderControlLog();
    renderEnvLog();
  };
}

// Re-render logs whenever the history page is opened (supplements the general nav listener above)
document.querySelectorAll(".nav-item[data-page='history']").forEach(btn => {
  btn.addEventListener("click", () => { renderControlLog(); renderEnvLog(); });
});

// Initial render (for entries restored from localStorage)
renderControlLog();
renderEnvLog();

// ── Boot ──────────────────────────────────────────────────────────────────────
useDemo();
navigateTo("dashboard");

try {
  const saved = sessionStorage.getItem("canopyKey");
  if (saved) key = saved;
} catch (_) { }

setInterval(poll, 2000);
