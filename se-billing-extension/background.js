/**
 * background.js — Service worker (MV3)
 *
 * จุดประสงค์: เป็นช่องทางเดียวที่ทำ HTTP I/O ไปหา backend server
 * - ไม่ติด mixed-content (chrome-extension origin, ไม่ใช่ HTTPS page)
 * - มี chrome.* APIs ครบ (storage, runtime)
 *
 * Messages handled (chrome.runtime.onMessage):
 *   { type: "get-server-url" }                → { url }
 *   { type: "set-server-url", url }           → { ok, url }
 *   { type: "get-api-token" }                 → { token }
 *   { type: "set-api-token", token }          → { ok, hasToken }
 *   { type: "fetch-config" }                  → { ok, config }   หรือ { ok:false, error }
 *   { type: "fetch-reference" }               → { ok, reference }
 *   { type: "send-capture", data }            → { ok, id }       หรือ { ok:false, error }
 *   { type: "dashboard-data" }                → { ok, data }     (งานค้างต่อหัวหน้า; ok:false ถ้ายังไม่มี)
 *   { type: "ping-server" }                   → { ok, healthz }
 *
 * Default server URL: https://billing.sesurvey.cloud (override ได้ผ่าน options.html)
 * API token: bearer token ที่ server ตั้งไว้ใน env API_TOKEN — เก็บใน chrome.storage
 */

const DEFAULT_SERVER_URL = "https://billing.sesurvey.cloud";

async function getServerUrl() {
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  return serverUrl || DEFAULT_SERVER_URL;
}

async function setServerUrl(url) {
  // strip trailing slash
  const clean = String(url || "").trim().replace(/\/+$/, "");
  await chrome.storage.local.set({ serverUrl: clean || DEFAULT_SERVER_URL });
  return clean || DEFAULT_SERVER_URL;
}

async function getApiToken() {
  const { apiToken } = await chrome.storage.local.get("apiToken");
  return apiToken || "";
}

async function setApiToken(token) {
  // strip zero-width / BOM chars (U+200B..U+200D, U+FEFF) that hitchhike on paste, then trim
  const clean = String(token || "").replace(/[​-‍﻿]/g, "").trim();
  await chrome.storage.local.set({ apiToken: clean });
  return clean;
}

// HTTP headers must be ISO-8859-1 (code points 0-255). Real bearer tokens are
// always printable ASCII, so anything outside that range is a paste artifact.
function isHeaderSafe(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xFF) return false;
  }
  return true;
}

async function fetchJson(path, opts = {}) {
  const base = await getServerUrl();
  const url = base + path;
  const headers = Object.assign({}, opts.headers || {});
  if (!opts.skipAuth) {
    const token = await getApiToken();
    if (token) {
      if (!isHeaderSafe(token)) {
        throw new Error("API token มีตัวอักษรที่ไม่ใช่ ASCII (อาจ paste มีอักขระล่องหน) — กรุณาพิมพ์/วาง token ใหม่");
      }
      headers["Authorization"] = "Bearer " + token;
    }
  }
  // strip our internal flag before passing to fetch
  const { skipAuth: _ignore, ...fetchOpts } = opts;
  const r = await fetch(url, { ...fetchOpts, headers });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${opts.method || "GET"} ${url} → ${r.status} ${txt}`);
  }
  return r.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "get-server-url": {
          sendResponse({ ok: true, url: await getServerUrl() });
          break;
        }
        case "set-server-url": {
          const url = await setServerUrl(msg.url);
          sendResponse({ ok: true, url });
          break;
        }
        case "get-api-token": {
          // คืน token ตรงๆ — extension options page เท่านั้นที่เรียก (ไม่มี content script ใช้)
          sendResponse({ ok: true, token: await getApiToken() });
          break;
        }
        case "set-api-token": {
          await setApiToken(msg.token);
          sendResponse({ ok: true, hasToken: !!(msg.token || "").trim() });
          break;
        }
        case "fetch-config": {
          const config = await fetchJson("/api/config");
          sendResponse({ ok: true, config });
          break;
        }
        case "fetch-reference": {
          const reference = await fetchJson("/api/reference");
          sendResponse({ ok: true, reference });
          break;
        }
        case "send-capture": {
          const r = await fetchJson("/api/captures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg.data || {}),
          });
          sendResponse({ ok: true, id: r.id });
          break;
        }
        case "dashboard-data": {
          // GET /api/dashboard — snapshot งานค้างต่อหัวหน้า (extenBoard)
          // 404 = ยังไม่มีข้อมูล (scraper ยังไม่อัป) → คืน ok:false ให้ผู้เรียกจัดการเงียบ ๆ
          const data = await fetchJson("/api/dashboard");
          sendResponse({ ok: true, data });
          break;
        }
        case "ping-server": {
          // ทดสอบเฉพาะ reachability — ข้าม auth เพื่อแยก issue "URL ผิด" ออกจาก "token เสีย"
          const healthz = await fetchJson("/healthz", { skipAuth: true });
          sendResponse({ ok: true, healthz });
          break;
        }
        default:
          sendResponse({ ok: false, error: `unknown message type: ${msg?.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // async response
});

console.log("[ISurveyHelper/background] Service worker ready");
