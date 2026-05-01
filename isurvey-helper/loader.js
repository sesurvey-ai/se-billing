/**
 * loader.js  —  ISOLATED-world bridge
 * ─────────────────────────────────────────────────────────────
 * Content scripts ใน MAIN world ไม่มีสิทธิ์เรียก chrome.* APIs
 * loader.js อยู่ใน ISOLATED world เลยเป็นตัวกลางสำหรับ:
 *
 *   1) Reference data (provinces / amphurs / tumbons JSON)
 *      → fetch ผ่าน chrome.runtime.getURL → broadcast เป็น "ref-data-response"
 *
 *   2) Config data (rates, modifiers, whitelist) — เก็บใน chrome.storage.local
 *      → ครั้งแรก: seed จาก default-data.json → write storage
 *      → อ่าน storage → broadcast เป็น "config-data-response"
 *      → ฟัง chrome.storage.onChanged → re-broadcast (live update)
 *
 * Protocols:
 *   ISOLATED → MAIN: { __isurveyHelper, type: "ref-data-response", payload }
 *                    { __isurveyHelper, type: "config-data-response", payload }
 *   MAIN → ISOLATED: { __isurveyHelper, type: "ref-data-request" }
 *                    { __isurveyHelper, type: "config-data-request" }
 *
 * ใช้ postMessage แทน inline script เพราะ cloud.isurvey.mobi มี CSP เข้ม
 */
(function () {
  "use strict";

  const REF_FILES = {
    provinces: "data/provinces.json",
    amphurs: "data/amphurs.json",
    tumbons: "data/tumbons.json",
  };
  const CONFIG_KEYS = [
    "PROVINCE_FEE_MAP",
    "AMPHUR_FEE_MAP",
    "TUMBON_FEE_MAP",
    "AMPHUR_FEE_TABLE",
    "modifierFees",
    "enabledProvinces",
  ];
  const ORIGIN = window.location.origin;
  const TAG = "[ISurveyHelper/loader]";

  let refPayload = null;
  let refReady = false;
  let configPayload = null;
  let configReady = false;

  // ─────────────────────────────────────────────────────────
  // Reference data (provinces / amphurs / tumbons)
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
  // Config data (chrome.storage.local + default-data.json seed)
  // ─────────────────────────────────────────────────────────

  /** อ่าน defaults จาก default-data.json */
  async function loadDefaults() {
    const url = chrome.runtime.getURL("default-data.json");
    const res = await fetch(url);
    return await res.json();
  }

  /** อ่าน config ปัจจุบันจาก chrome.storage; ถ้า key ใดยังไม่มี → seed จาก defaults */
  async function loadConfigWithSeed() {
    const stored = await chrome.storage.local.get(CONFIG_KEYS);
    const missing = CONFIG_KEYS.filter(k => stored[k] === undefined);
    if (missing.length > 0) {
      const defaults = await loadDefaults();
      const seed = {};
      for (const k of missing) {
        seed[k] = defaults[k];
        stored[k] = defaults[k];
      }
      await chrome.storage.local.set(seed);
      console.log(TAG, "Seeded missing keys to storage:", missing.join(", "));
    }
    return stored;
  }

  function broadcastConfig() {
    if (!configReady || !configPayload) return;
    window.postMessage(
      { __isurveyHelper: true, type: "config-data-response", payload: configPayload },
      ORIGIN
    );
  }

  // ─────────────────────────────────────────────────────────
  // Message listener (request handler)
  // ─────────────────────────────────────────────────────────

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__isurveyHelper !== true) return;
    if (d.type === "ref-data-request") broadcastRef();
    if (d.type === "config-data-request") broadcastConfig();
  });

  // ─────────────────────────────────────────────────────────
  // Live reload: ฟัง chrome.storage.onChanged → re-broadcast
  // ─────────────────────────────────────────────────────────

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    const relevant = Object.keys(changes).some(k => CONFIG_KEYS.includes(k));
    if (!relevant) return;

    // อ่าน state ใหม่ทั้งก้อน — เพื่อให้ payload สมบูรณ์
    const stored = await chrome.storage.local.get(CONFIG_KEYS);
    configPayload = stored;
    broadcastConfig();
    console.log(TAG, "Config storage changed → re-broadcasted");
  });

  // ─────────────────────────────────────────────────────────
  // Bootstrap: load both ref + config in parallel, broadcast when ready
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

  (async function () {
    try {
      configPayload = await loadConfigWithSeed();
      configReady = true;
      broadcastConfig();
    } catch (e) {
      console.warn(TAG, "failed to load config from storage:", e);
    }
  })();
})();
