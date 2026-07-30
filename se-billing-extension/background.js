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

// ═══════════════════════════════════════════════════════════════════════
// Dynamic content scripts — รองรับ URL ใหม่ของ isurvey โดยไม่ต้องรอ Web Store
//
// ปัญหา: isurvey กำลังย้ายเว็บแต่ยังไม่บอก URL production ถ้า URL ไม่อยู่ใน
// manifest extension จะไม่ inject เลย และแก้ทีต้องรอ review หลายวัน
//
// วิธีแก้: manifest ขอ host_permissions กว้าง (*.isurvey.mobi / *.appspot.com)
// แต่ content_scripts ประกาศตรงแค่ 2 โฮสต์ที่รู้แน่ ส่วนโดเมนอื่นมาจาก
// allowedOrigins ในคอนฟิกเซิร์ฟเวอร์ → register ตอน runtime
//
// ผลลัพธ์: กว้างในสิทธิ์ แคบในพฤติกรรม — ไม่แตะเว็บ appspot อื่นในโลก
// และเพิ่ม URL ใหม่ได้จาก /admin ใน 30 วินาที
// ═══════════════════════════════════════════════════════════════════════

// โฮสต์ที่ manifest ประกาศ content_scripts ไว้ตรงๆ แล้ว — ห้าม register ซ้ำ (จะ inject 2 รอบ)
const STATIC_HOSTS = [
  "cloud.isurvey.mobi",
  "se-web-prodv2-dot-isurvey-se-gcp.as.r.appspot.com",
];

// ต้องตรงกับ host_permissions ใน manifest — register match ที่ไม่มีสิทธิ์จะ throw ทั้งชุด
const PERMITTED_HOST_RE = /(^|\.)(isurvey\.mobi|appspot\.com)$/i;

// โครงเดียวกับ content_scripts ใน manifest — แก้ที่นั่นต้องแก้ที่นี่ด้วย
const SCRIPT_BLOCKS = [
  { id: "dyn-loader", js: ["loader.js"], runAt: "document_start", world: "ISOLATED" },
  {
    id: "dyn-main",
    js: [
      "config-bridge.js",
      "resolver.js",
      "content.js",
      "feature-out-of-area-amount.js",
      "feature-out-of-hours-amount.js",
      "feature-deduct-amount.js",
      "feature-sub-area-checkbox.js",
      "feature-daily-check-amount.js",
    ],
    runAt: "document_idle",
    world: "MAIN",
  },
  { id: "dyn-badge", js: ["dashboard-badge.js"], runAt: "document_idle", world: "ISOLATED" },
];

const DYN_IDS = SCRIPT_BLOCKS.map((b) => b.id);

/** origin ("https://host") → match pattern ; null ถ้าใช้ไม่ได้/ไม่ต้องทำ */
function originToMatch(origin) {
  let host;
  try {
    const u = new URL(String(origin));
    if (u.protocol !== "https:") return null;
    host = u.hostname;
  } catch {
    return null;
  }
  if (!host || STATIC_HOSTS.includes(host)) return null;   // ประกาศใน manifest แล้ว
  if (!PERMITTED_HOST_RE.test(host)) return null;          // ไม่มีสิทธิ์ — ข้ามเงียบ
  return "https://" + host + "/*";
}

let lastSyncedKey = "";

/**
 * อัปเดต dynamic content scripts ให้ตรงกับ allowedOrigins
 * เซิร์ฟเวอร์ล่ม / ไม่มีคอนฟิก → ไม่แตะของเดิม (ดีกว่าถอนสิทธิ์ตัวเองกลางวัน)
 */
async function syncDynamicScripts(allowedOrigins) {
  if (!Array.isArray(allowedOrigins)) return;
  // permission "scripting" ยังไม่ถูกอนุมัติ (manifest เก่าค้างอยู่) → ข้ามไปเงียบๆ
  if (!chrome.scripting?.registerContentScripts) return;

  const matches = [...new Set(allowedOrigins.map(originToMatch).filter(Boolean))];
  const key = matches.join("|");
  if (key === lastSyncedKey) return;    // ไม่เปลี่ยน — ไม่ต้องทำอะไร

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: DYN_IDS })
    .catch(() => []);
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) })
      .catch(() => {});
  }

  if (matches.length) {
    await chrome.scripting.registerContentScripts(
      SCRIPT_BLOCKS.map((b) => ({ ...b, matches, allFrames: false, persistAcrossSessions: true }))
    );
  }

  lastSyncedKey = key;
  console.log(
    "[ISurveyHelper/background] dynamic scripts:",
    matches.length ? matches.join(", ") : "(ไม่มีโดเมนเพิ่ม — ใช้เฉพาะที่ประกาศใน manifest)"
  );
}

/** ดึงคอนฟิกแล้ว sync — ใช้ตอน startup/alarm ที่ไม่มี content script คอยเรียกให้ */
async function refreshDynamicScripts() {
  try {
    const config = await fetchJson("/api/config");
    await syncDynamicScripts(config?.allowedOrigins);
  } catch (e) {
    // โดเมนใหม่จะยังไม่ทำงานจนกว่าจะต่อเซิร์ฟเวอร์ได้ — ตั้งใจให้ fail-closed
    console.warn("[ISurveyHelper/background] sync dynamic scripts ล้มเหลว:", String(e?.message || e));
  }
}

// ── ผูก listener แบบไม่ให้ล้ม service worker ─────────────────────────────
// ถ้า permission ใน manifest ไม่ตรงกับโค้ด (เช่น ผู้ใช้ยังไม่ reload extension
// หลังอัปเดต manifest) chrome.alarms/scripting จะเป็น undefined → throw ที่
// top-level → service worker ไม่ start → ทั้ง extension ตาย (config โหลดไม่ได้,
// capture ส่งไม่ได้) ฟีเจอร์ allowlist สำคัญน้อยกว่าตัว extension ทั้งตัวมาก
const ALARM_SYNC = "se-billing-sync-origins";

function scheduleOriginSync() {
  try {
    if (chrome.alarms?.create) chrome.alarms.create(ALARM_SYNC, { periodInMinutes: 5 });
  } catch (e) {
    console.warn("[ISurveyHelper/background] ตั้ง alarm ไม่ได้:", String(e?.message || e));
  }
  refreshDynamicScripts();
}

try {
  chrome.runtime.onInstalled.addListener(scheduleOriginSync);
  chrome.runtime.onStartup.addListener(scheduleOriginSync);
  chrome.alarms?.onAlarm?.addListener((a) => {
    if (a.name === ALARM_SYNC) refreshDynamicScripts();
  });
} catch (e) {
  console.warn("[ISurveyHelper/background] ผูก listener โดเมนไม่ได้:", String(e?.message || e));
}

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
          // loader poll ทุก 30s อยู่แล้ว — เกาะไปด้วยเลย ได้ผลเร็วกว่ารอ alarm 5 นาที
          syncDynamicScripts(config?.allowedOrigins);
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
