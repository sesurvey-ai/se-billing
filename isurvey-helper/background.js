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
 *   { type: "fetch-config" }                  → { ok, config }   หรือ { ok:false, error }
 *   { type: "fetch-reference" }               → { ok, reference }
 *   { type: "send-capture", data }            → { ok, id }       หรือ { ok:false, error }
 *   { type: "ping-server" }                   → { ok, healthz }
 *
 * Default server URL: http://localhost:3200 (override ได้ผ่าน options.html)
 */

const DEFAULT_SERVER_URL = "http://localhost:3200";

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

async function fetchJson(path, opts = {}) {
  const base = await getServerUrl();
  const url = base + path;
  const r = await fetch(url, opts);
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
