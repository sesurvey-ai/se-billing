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
  const clean = String(token || "").trim();
  await chrome.storage.local.set({ apiToken: clean });
  return clean;
}

async function fetchJson(path, opts = {}) {
  const base = await getServerUrl();
  const token = await getApiToken();
  const url = base + path;
  const headers = Object.assign({}, opts.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(url, { ...opts, headers });
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
        case "ping-server": {
          const healthz = await fetchJson("/healthz");
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
