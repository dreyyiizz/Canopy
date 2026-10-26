"use strict";
const $ = id => document.getElementById(id);
let demo = true, busy = false, polling = false, generation = 0;
let lastSuccess = 0, current = null, key = "";
let independentMode = false;
let hasPendingChanges = false;
const controls = ["closeRoof", "openRoof", "applyLevel", "level", "applyIndependent", "leftLevel", "rightLevel"];

async function request(method, path, data) {
  const body = data ? JSON.stringify(data) : "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const response = await fetch(path, {
      method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: data ? body : undefined, signal: controller.signal, cache: "no-store"
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The server could not complete that request.");
    return result;
  } finally { clearTimeout(timer); }
}

function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.toggle("error", error);
}

function enableControls() {
  const ready = demo || (current && current.connected && Date.now() - lastSuccess < 8000);
  controls.forEach(id => {
    const elem = $(id);
    if (elem) elem.disabled = busy || !ready;
  });
  $("connectButton").disabled = busy;
  $("demoButton").disabled = busy;
}

function updateDraft() { 
  $("draftValue").textContent = `${Math.round(Number($("level").value) / 30 * 100)}%`;
  markAsPending();
}

function updateLeftDraft() {
  $("draftLeftValue").textContent = `${Math.round(Number($("leftLevel").value) / 30 * 100)}%`;
  markAsPending();
}

function updateRightDraft() {
  $("draftRightValue").textContent = `${Math.round(Number($("rightLevel").value) / 30 * 100)}%`;
  markAsPending();
}

function markAsPending() {
  if (!hasPendingChanges) {
    hasPendingChanges = true;
    if (independentMode) {
      $("applyIndependent").classList.add("pending");
    } else {
      $("applyLevel").classList.add("pending");
    }
  }
}

function clearPending() {
  hasPendingChanges = false;
  $("applyLevel").classList.remove("pending");
  $("applyIndependent").classList.remove("pending");
}

function switchMode(toIndependent) {
  independentMode = toIndependent;
  $("parallelControls").classList.toggle("active", !toIndependent);
  $("independentControls").classList.toggle("active", toIndependent);
  $("parallelModeBtn").classList.toggle("active", !toIndependent);
  $("independentModeBtn").classList.toggle("active", toIndependent);
  clearPending();
}

function draw(state, resetDraft = false) {
  current = state;
  const known = Number.isInteger(state.level) && state.level >= 0 && state.level <= 30;
  const leftKnown = Number.isInteger(state.leftLevel) && state.leftLevel >= 0 && state.leftLevel <= 30;
  const rightKnown = Number.isInteger(state.rightLevel) && state.rightLevel >= 0 && state.rightLevel <= 30;
  
  const value = known ? Math.round(state.level / 30 * 100) : null;
  $("percent").textContent = known ? value : "—";
  $("positionLabel").textContent = !known ? "Waiting for the Arduino" : (state.level === 0 ? "Closed target" : state.level === 30 ? "Open target" : "Partly open target") + (demo || state.demo ? " · demo" : "");
  $("controlValue").textContent = known ? `Control level ${state.level} / 30` : "Control level unknown";
  
  // Schematic travel: two outer hinges, free ends meeting at the center
  // Use independent levels for visualization if available
  const leftVal = leftKnown ? state.leftLevel : (known ? state.level : 15);
  const rightVal = rightKnown ? state.rightLevel : (known ? state.level : 15);
  const leftAngle = leftVal / 30 * 65;
  const rightAngle = rightVal / 30 * 65;
  $("roofLeft").style.transform = `rotate(${-leftAngle}deg)`;
  $("roofRight").style.transform = `rotate(${rightAngle}deg)`;
  
  $("temperature").textContent = state.connected && Number.isFinite(state.temperature_c) ? state.temperature_c.toFixed(1) : "—";
  $("humidity").textContent = state.connected && Number.isFinite(state.humidity_pct) ? String(Math.round(state.humidity_pct)) : "—";
  
  const simulated = demo || state.demo;
  $("sensorBadge").textContent = simulated ? "Sample readings" : state.connected ? "DHT11 · every 2 seconds" : "Readings unavailable";
  $("connectionBadge").textContent = simulated ? "Demo mode" : state.connected ? "Arduino online" : "Arduino offline";
  $("connectionBadge").classList.toggle("live", !simulated && state.connected);
  $("modeTag").textContent = simulated ? "SIMULATION" : state.connected ? "USB CONNECTED" : "DISCONNECTED";
  $("connectionTitle").textContent = demo ? "Try it out first" : state.demo ? "Demo mode connected" : state.connected ? "Arduino connected via USB" : "Arduino offline";
  $("connectionDetail").textContent = demo ? "Connect your Arduino when you're ready." : state.demo ? "The server is simulating an Arduino." : state.connected ? "USB connection active." : "Check the USB cable and selected COM port.";
  $("statusDot").classList.toggle("live", !simulated && state.connected);
  $("connectLink").textContent = demo ? "Connect →" : "Settings →";
  
  if (resetDraft) {
    if (known) { 
      $("level").value = state.level; 
      updateDraft(); 
    }
    if (leftKnown) {
      $("leftLevel").value = state.leftLevel;
      updateLeftDraft();
    }
    if (rightKnown) {
      $("rightLevel").value = state.rightLevel;
      updateRightDraft();
    }
    clearPending();
  }
  enableControls();
}

function useDemo() {
  generation++; demo = true; busy = false; lastSuccess = Date.now();
  draw({ connected: true, demo: true, level: 15, leftLevel: 15, rightLevel: 15, temperature_c: 28, humidity_pct: 65 }, true);
  notice("Demo mode. These controls do not move your real roof.");
  $("settings").close();
}

async function sendLevel(level) {
  if (busy || $("applyLevel").disabled) return;
  busy = true; enableControls(); const epoch = ++generation;
  try {
    if (demo) {
      draw({ ...current, level, leftLevel: level, rightLevel: level }, true);
      notice(`Demo target set to ${Math.round(level / 30 * 100)}%. Your real roof has not moved.`);
    } else {
      notice("Sending to Arduino…");
      const result = await request("POST", "/api/roof", { level });
      if (epoch !== generation) return;
      lastSuccess = Date.now(); draw(result, true);
      notice(result.demo ? "Demo mode updated. No real roof moved." : "Arduino accepted the target. Check the roof to confirm its position.");
    }
  } catch (error) {
    if (epoch === generation) {
      notice(`${error.message} Command outcome may be unknown; check the roof before retrying.`, true);
      if (current) draw({ ...current, connected: false });
    }
  } finally { if (epoch === generation) { busy = false; enableControls(); } }
}

async function sendIndependentLevels(leftLevel, rightLevel) {
  if (busy || $("applyIndependent").disabled) return;
  busy = true; enableControls(); const epoch = ++generation;
  try {
    if (demo) {
      const newLevel = (leftLevel === rightLevel) ? leftLevel : current.level;
      draw({ ...current, level: newLevel, leftLevel, rightLevel }, true);
      notice(`Demo: Left ${Math.round(leftLevel / 30 * 100)}%, Right ${Math.round(rightLevel / 30 * 100)}%. Your real roof has not moved.`);
    } else {
      notice("Sending to Arduino…");
      const result = await request("POST", "/api/roof-independent", { leftLevel, rightLevel });
      if (epoch !== generation) return;
      lastSuccess = Date.now(); draw(result, true);
      notice(result.demo ? "Demo mode updated. No real roof moved." : "Arduino accepted independent targets. Check the roof to confirm positions.");
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
    else if (!wasOnline) notice(result.demo ? "Demo mode connected. No hardware is being controlled." : "Arduino connected. Roof controls are ready.");
  } catch (error) {
    if (epoch !== generation) return;
    draw({ ...current, connected: false });
    $("connectionBadge").textContent = "Server offline";
    $("connectionTitle").textContent = "Cannot reach server";
    $("connectionDetail").textContent = "Make sure Start-Canopy.cmd is running.";
    notice("Server connection lost. Make sure Start-Canopy.cmd is running.", true);
  } finally { polling = false; }
}

function showSettings() {
  $("settingsError").textContent = "";
  $("accessKey").value = key;
  $("settings").showModal();
}

$("setup").onclick = showSettings;
$("connectLink").onclick = showSettings;
$("dismissSettings").onclick = () => $("settings").close();
$("demoButton").onclick = useDemo;
$("closeRoof").onclick = () => sendLevel(0);
$("openRoof").onclick = () => sendLevel(30);
$("applyLevel").onclick = () => sendLevel(Number($("level").value));
$("applyIndependent").onclick = () => sendIndependentLevels(Number($("leftLevel").value), Number($("rightLevel").value));
$("level").oninput = updateDraft;
$("leftLevel").oninput = updateLeftDraft;
$("rightLevel").oninput = updateRightDraft;
$("parallelModeBtn").onclick = () => switchMode(false);
$("independentModeBtn").onclick = () => switchMode(true);

$("connectionForm").onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  const enteredKey = $("accessKey").value.trim();
  if (!enteredKey) { $("settingsError").textContent = "Enter the connection key shown in the terminal."; return; }
  
  generation++; const epoch = generation; key = enteredKey; demo = false; busy = true; enableControls();
  $("settingsError").textContent = "Connecting…";
  try {
    const result = await request("GET", "/api/status");
    if (epoch !== generation) return;
    lastSuccess = Date.now(); draw(result, true);
    try { sessionStorage.setItem("canopyKey", key); } catch (_) { }
    $("settings").close();
    notice(result.demo ? "Connected in demo mode. No real roof will move." : result.connected ? "Connected. The Arduino is ready for commands." : result.error || "Server connected. Waiting for the Arduino USB connection.", !result.connected);
  } catch (error) {
    if (epoch === generation) { $("settingsError").textContent = error.message; draw({ connected: false, level: null }); }
  } finally { if (epoch === generation) { busy = false; enableControls(); } }
};

// Start in demo mode
useDemo();

// Try to restore key from session
try { 
  const saved = sessionStorage.getItem("canopyKey"); 
  if (saved) key = saved;
} catch (_) { }

// Poll for status every 2 seconds
setInterval(poll, 2000);
