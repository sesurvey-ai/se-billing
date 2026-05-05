/**
 * loader.js  —  ISOLATED-world bridge between MAIN-world content scripts and the
 * extension's service worker (background.js)
 *
 * Responsibilities (post v2.0 — server-backed):
 *
 *   1) Reference data (provinces / amphurs / tumbons)
 *      → fetch ผ่าน chrome.runtime.getURL (local files in extension)
 *      → ส่ง MAIN ผ่าน postMessage("ref-data-response")
 *
 *   2) Config data (rates, modifiers, whitelist) — มาจาก backend server
 *      → ขอจาก background.js (ซึ่ง fetch จาก http://<serverUrl>/api/config)
 *      → broadcast เป็น "config-data-response" ไป MAIN
 *      → poll ทุก 30s เพื่อ pick up การแก้ไขจาก /admin (live update)
 *
 *   3) Capture forwarding — รับ "capture-data" จาก MAIN
 *      → forward ไป background.js → POST /api/captures
 *
 * MAIN ห้าม fetch http server ตรงเพราะ mixed-content (HTTPS → HTTP).
 * Background service worker ทำได้เพราะอยู่ใน extension origin (chrome-extension://).
 *
 * Protocol:
 *   ISOLATED → MAIN: { __isurveyHelper, type: "ref-data-response",     payload }
 *                    { __isurveyHelper, type: "config-data-response",  payload }
 *   MAIN → ISOLATED: { __isurveyHelper, type: "ref-data-request" }
 *                    { __isurveyHelper, type: "config-data-request" }
 *                    { __isurveyHelper, type: "capture-data", payload }
 */
(function () {
  "use strict";

  const REF_FILES = {
    provinces: "data/provinces.json",
    amphurs:   "data/amphurs.json",
    tumbons:   "data/tumbons.json",
  };
  const ORIGIN = window.location.origin;
  const TAG = "[ISurveyHelper/loader]";
  const CONFIG_POLL_MS = 30000; // poll every 30s for live update

  let refPayload = null;
  let refReady = false;
  let configPayload = null;
  let configReady = false;
  let lastConfigSig = "";

  // ─────────────────────────────────────────────────────────
  // Reference data (local extension files)
  // ─────────────────────────────────────────────────────────

  async function loadAsMap(path, idKey, nameKey) {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    const json = await res.json();
    const arr = json.data || [];
    const map = Object.create(null);
    for (const row of arr) {
      const id = row[idKey];
      if (id) map[String(id)] = row[nameKey];
    }
    return map;
  }

  function broadcastRef() {
    if (!refReady || !refPayload) return;
    window.postMessage(
      { __isurveyHelper: true, type: "ref-data-response", payload: refPayload },
      ORIGIN
    );
  }

  // ─────────────────────────────────────────────────────────
  // Config data (from backend via background.js)
  // ─────────────────────────────────────────────────────────

  function broadcastConfig() {
    if (!configReady || !configPayload) return;
    window.postMessage(
      { __isurveyHelper: true, type: "config-data-response", payload: configPayload },
      ORIGIN
    );
  }

  async function fetchConfigFromServer() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "fetch-config" }, (r) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(r || { ok: false, error: "no response" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e?.message || e) });
      }
    });
  }

  async function refreshConfig({ initial = false } = {}) {
    const r = await fetchConfigFromServer();
    if (!r.ok) {
      if (initial) console.warn(TAG, "Initial config fetch failed:", r.error);
      return;
    }
    const sig = JSON.stringify(r.config);
    if (sig === lastConfigSig) return; // no change
    lastConfigSig = sig;
    configPayload = r.config;
    configReady = true;
    broadcastConfig();
    console.log(TAG, initial ? "Config loaded from server" : "Config updated from server (poll)");
  }

  // ─────────────────────────────────────────────────────────
  // Message listener (request handler + capture forwarding)
  // ─────────────────────────────────────────────────────────

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__isurveyHelper !== true) return;

    if (d.type === "ref-data-request") broadcastRef();
    if (d.type === "config-data-request") broadcastConfig();

    if (d.type === "capture-data" && d.payload) {
      try {
        chrome.runtime.sendMessage({ type: "send-capture", data: d.payload }, (r) => {
          if (chrome.runtime.lastError) {
            console.warn(TAG, "Capture send failed:", chrome.runtime.lastError.message);
          } else if (r && r.ok === false) {
            console.warn(TAG, "Capture rejected:", r.error);
          }
        });
      } catch (e) {
        console.warn(TAG, "Capture send error:", e);
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  // Bootstrap: fetch ref data + initial config + start polling
  // ─────────────────────────────────────────────────────────

  (async function () {
    try {
      const [provinces, amphurs, tumbons] = await Promise.all([
        loadAsMap(REF_FILES.provinces, "provinceID", "provincename"),
        loadAsMap(REF_FILES.amphurs,   "amphurID",   "amphurname"),
        loadAsMap(REF_FILES.tumbons,   "tumbonID",   "tumbonname"),
      ]);
      refPayload = {
        byProvinceId: provinces,
        byAmphurId: amphurs,
        byTumbonId: tumbons,
        counts: {
          provinces: Object.keys(provinces).length,
          amphurs: Object.keys(amphurs).length,
          tumbons: Object.keys(tumbons).length,
        },
        loadedAt: new Date().toISOString(),
      };
      refReady = true;
      broadcastRef();
    } catch (e) {
      console.warn(TAG, "failed to load reference JSON:", e);
    }
  })();

  // Initial config fetch + polling
  refreshConfig({ initial: true });
  setInterval(() => refreshConfig(), CONFIG_POLL_MS);
})();
