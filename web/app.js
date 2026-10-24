"use strict";
const $ = id => document.getElementById(id);
const nativeApp = Boolean(window.LaptopBridge);
let demo = true, busy = false, polling = false, generation = 0, sequence = 0;
let lastSuccess = 0, current = null, server = "", key = "";
const pending = new Map();
const controls = ["closeRoof", "openRoof", "applyLevel", "level"];

window.receiveLaptopResponse = (id, response) => {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer); pending.delete(id);
  if (response.error) entry.reject(new Error(response.error));
  else if (response.status >= 200 && response.status < 300) entry.resolve(response.data);
  else entry.reject(new Error(response.data.error || "The laptop could not complete that request."));
};

async function request(method, path, data) {
  const body = data ? JSON.stringify(data) : "";
  if (nativeApp) return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("No reply. Check the laptop and USB cable.")); }, 11000);
    pending.set(id, { resolve, reject, timer });
    window.LaptopBridge.request(id, server, key, method, path, body);
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const response = await fetch(path, {
      method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: data ? body : undefined, signal: controller.signal, cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The laptop could not complete that request.");
    return result;
  } finally { clearTimeout(timer); }
}

function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}
function enableControls() {
  const ready = demo || (current && current.connected && Date.now() - lastSuccess < 8000);
  controls.forEach(id => $(id).disabled = busy || !ready);
  $("connectButton").disabled = busy;
  $("demoButton").disabled = busy;
}
function updateDraft() { $("draftValue").textContent = `${Math.round(Number($("level").value) / 30 * 100)}%`; }
function draw(state, resetDraft = false) {
  current = state;
  const known = Number.isInteger(state.level) && state.level >= 0 && state.level <= 30;
  const value = known ? Math.round(state.level / 30 * 100) : null;
  $("percent").textContent = known ? value : "—";
  $("positionLabel").textContent = !known ? "Waiting for the Arduino" : (state.level === 0 ? "Closed target" : state.level === 30 ? "Open target" : "Partly open target") + (demo || state.demo ? " · demo" : "");
  $("controlValue").textContent = known ? `Control level ${state.level} / 30` : "Control level unknown";
  // Schematic travel only: two outer hinges, free ends meeting at the center.
  // The illustration angle is not a servo angle or a measured roof angle.
  const illustrationAngle = known ? state.level / 30 * 65 : 0;
  $("roofLeft").style.transform = `rotate(${-illustrationAngle}deg)`;
  $("roofRight").style.transform = `rotate(${illustrationAngle}deg)`;
  $("temperature").textContent = state.connected && Number.isFinite(state.temperature_c) ? state.temperature_c.toFixed(1) : "—";
  $("humidity").textContent = state.connected && Number.isFinite(state.humidity_pct) ? String(Math.round(state.humidity_pct)) : "—";
  const simulated = demo || state.demo;
  $("sensorBadge").textContent = simulated ? "Sample readings" : state.connected ? "DHT11 · every 2 seconds" : "Readings unavailable";
  $("connectionBadge").textContent = simulated ? "Demo mode" : state.connected ? "Arduino online" : "Arduino offline";
  $("connectionBadge").classList.toggle("live", !simulated && state.connected);
  $("modeTag").textContent = simulated ? "SIMULATION" : state.connected ? "USB CONNECTED" : "DISCONNECTED";
  $("connectionTitle").textContent = demo ? "Try it out first" : state.demo ? "Laptop demo connected" : state.connected ? "Connected through laptop" : "Laptop reached · Arduino offline";
  $("connectionDetail").textContent = demo ? "Connect your laptop when you’re ready." : state.demo ? "The laptop is simulating an Arduino." : state.connected ? "Keep the laptop awake and USB connected." : "Check the USB cable and selected COM port.";
  $("statusDot").classList.toggle("live", !simulated && state.connected);
  $("connectLink").textContent = demo ? "Connect →" : "Settings →";
  if (resetDraft && known) { $("level").value = state.level; updateDraft(); }
  enableControls();
}

function useDemo() {
  generation++; demo = true; busy = false; lastSuccess = Date.now();
  draw({ connected: true, demo: true, level: 15, temperature_c: 28, humidity_pct: 65 }, true);
  notice("Demo mode. These controls do not move your real roof.");
  $("settings").close();
}
async function sendLevel(level) {
  if (busy || $("applyLevel").disabled) return;
  busy = true; enableControls(); const epoch = ++generation;
  try {
    if (demo) {
      draw({ ...current, level }, true);
      notice(`Demo target set to ${Math.round(level / 30 * 100)}%. Your real roof has not moved.`);
    } else {
      notice("Sending to Arduino…");
      const result = await request("POST", "/api/roof", { level });
      if (epoch !== generation) return;
      lastSuccess = Date.now(); draw(result, true);
      notice(result.demo ? "Laptop demo updated. No real roof moved." : "Arduino accepted the target. Check the roof to confirm its position.");
    }
  } catch (error) {
    if (epoch === generation) {
      notice(`${error.message} Command outcome may be unknown; check the roof before retrying.`, true);
      if (current) draw({ ...current, connected: false });
    }
  } finally { if (epoch === generation) { busy = false; enableControls(); } }
}

async function poll() {
  enableControls();
  if (demo || polling || busy) return;
  polling = true; const epoch = generation;
  try {
    const result = await request("GET", "/api/status");
    if (epoch !== generation) return;
    const wasOnline = current && current.connected;
    lastSuccess = Date.now(); draw(result);
    if (!result.connected) notice(result.error || "Arduino disconnected. Roof commands are unavailable.", true);
    else if (!wasOnline) notice(result.demo ? "Laptop demo connected. No hardware is being controlled." : "Arduino connected. Roof controls are ready.");
  } catch (error) {
    if (epoch !== generation) return;
    draw({ ...current, connected: false });
    $("connectionBadge").textContent = "Laptop offline";
    $("connectionTitle").textContent = "Cannot reach laptop";
    $("connectionDetail").textContent = "Check Wi-Fi and keep the bridge running.";
    notice("Laptop connection lost. Check Wi-Fi, its address, and the connection key.", true);
  } finally { polling = false; }
}

function showSettings() {
  $("settingsError").textContent = "";
  $("serverAddress").value = server;
  $("accessKey").value = key;
  if (!nativeApp) {
    $("serverAddress").value = location.origin;
    $("serverAddress").readOnly = true;
    $("addressHint").textContent = "This browser connects to the laptop hosting this page. Enter the key shown in its Canopy window.";
  }
  $("settings").showModal();
}
$("setup").onclick = showSettings;
$("connectLink").onclick = showSettings;
$("dismissSettings").onclick = () => $("settings").close();
$("demoButton").onclick = useDemo;
$("closeRoof").onclick = () => sendLevel(0);
$("openRoof").onclick = () => sendLevel(30);
$("applyLevel").onclick = () => sendLevel(Number($("level").value));
$("level").oninput = updateDraft;
$("connectionForm").onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  const enteredKey = $("accessKey").value.trim();
  if (!enteredKey) { $("settingsError").textContent = "Enter the connection key shown on your laptop."; return; }
  try {
    const entered = new URL(nativeApp ? $("serverAddress").value.trim() : location.origin);
    if (!["http:", "https:"].includes(entered.protocol) || entered.username || entered.password || entered.search || entered.hash || entered.pathname !== "/") throw new Error();
    server = entered.origin;
  } catch (_) { $("settingsError").textContent = "Use an address like http://192.168.1.20:8765"; return; }
  generation++; const epoch = generation; key = enteredKey; demo = false; busy = true; enableControls();
  $("settingsError").textContent = "Connecting…";
  try {
    const result = await request("GET", "/api/status");
    if (epoch !== generation) return;
    lastSuccess = Date.now(); draw(result, true);
    try { sessionStorage.setItem("canopyConnection", JSON.stringify({server, key})); } catch (_) { }
    $("settings").close();
    notice(result.demo ? "Connected to laptop demo. No real roof will move." : result.connected ? "Connected. The Arduino is ready for commands." : result.error || "Laptop connected. Waiting for the Arduino USB connection.", !result.connected);
  } catch (error) {
    if (epoch === generation) { $("settingsError").textContent = error.message; draw({ connected: false, level: null }); }
  } finally { if (epoch === generation) { busy = false; enableControls(); } }
};
useDemo();
try { const saved = JSON.parse(sessionStorage.getItem("canopyConnection")); if (saved) { server = saved.server; key = saved.key; } } catch (_) { }
setInterval(poll, 2000);
