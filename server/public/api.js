// api.js — REST client (shared by viewer/admin/captures)
"use strict";

const API_BASE = ""; // same origin

function getToken() {
  try { return localStorage.getItem("apiToken") || ""; } catch { return ""; }
}

function redirectToLogin() {
  // เก็บหน้าปัจจุบันไว้ให้ login กลับมาให้ถูก
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location = `/login.html?next=${next}`;
}

async function req(method, path, body) {
  const opts = { method, headers: {} };
  const token = getToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API_BASE + path, opts);
  if (r.status === 401) {
    // token ผิด/หมดอายุ → ล้าง + redirect ไป login
    try { localStorage.removeItem("apiToken"); } catch {}
    redirectToLogin();
    throw new Error("unauthorized — redirecting to login");
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${method} ${path} → ${r.status}: ${txt}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

// Logout helper — ใช้ใน admin/captures ผ่านปุ่ม "ออกจากระบบ"
function logout() {
  try { localStorage.removeItem("apiToken"); } catch {}
  window.location = "/login.html";
}
window.logout = logout;

const api = {
  config:   () => req("GET", "/api/config"),
  reference: () => req("GET", "/api/reference"),

  provinceRates:   {
    list:   () => req("GET", "/api/province-rates"),
    upsert: (id, sur_invest) => req("PUT", `/api/province-rates/${encodeURIComponent(id)}`, { sur_invest }),
    remove: (id) => req("DELETE", `/api/province-rates/${encodeURIComponent(id)}`),
  },
  amphurOverrides: {
    list:   () => req("GET", "/api/amphur-overrides"),
    upsert: (id, sur_invest) => req("PUT", `/api/amphur-overrides/${encodeURIComponent(id)}`, { sur_invest }),
    remove: (id) => req("DELETE", `/api/amphur-overrides/${encodeURIComponent(id)}`),
  },
  tumbonOverrides: {
    list:   () => req("GET", "/api/tumbon-overrides"),
    upsert: (id, sur_invest) => req("PUT", `/api/tumbon-overrides/${encodeURIComponent(id)}`, { sur_invest }),
    remove: (id) => req("DELETE", `/api/tumbon-overrides/${encodeURIComponent(id)}`),
  },
  amphurTable: {
    list:   () => req("GET", "/api/amphur-table"),
    upsert: (id, fields) => req("PUT", `/api/amphur-table/${encodeURIComponent(id)}`, fields),
    remove: (id) => req("DELETE", `/api/amphur-table/${encodeURIComponent(id)}`),
  },
  tumbonFeeOverride: {
    list:   () => req("GET", "/api/tumbon-fee-override"),
    upsert: (id, fields) => req("PUT", `/api/tumbon-fee-override/${encodeURIComponent(id)}`, fields),
    remove: (id) => req("DELETE", `/api/tumbon-fee-override/${encodeURIComponent(id)}`),
  },
  surveyorTeams: {
    list:   () => req("GET", "/api/surveyor-teams"),
    upsert: (code, team) => req("PUT", `/api/surveyor-teams/${encodeURIComponent(code)}`, { team }),
    remove: (code) => req("DELETE", `/api/surveyor-teams/${encodeURIComponent(code)}`),
  },
  enabledProvinces: {
    list: () => req("GET", "/api/enabled-provinces"),
    set:  (ids) => req("PUT", "/api/enabled-provinces", { ids }),
  },
  modifiers: {
    get: () => req("GET", "/api/modifiers"),
    set: (m) => req("PUT", "/api/modifiers", m),
  },
  captures: {
    list:   ({ limit = 100, offset = 0, provinceId } = {}) => {
      const q = new URLSearchParams();
      q.set("limit", limit); q.set("offset", offset);
      if (provinceId) q.set("provinceId", provinceId);
      return req("GET", `/api/captures?${q}`);
    },
    insert: (rec) => req("POST", "/api/captures", rec),
    remove: (id) => req("DELETE", `/api/captures/${id}`),
    clear:  () => req("DELETE", "/api/captures"),
    xlsxDownload: async ({ provinceId } = {}) => {
      const q = new URLSearchParams();
      if (provinceId) q.set("provinceId", provinceId);
      const qs = q.toString();
      const url = `/api/captures.xlsx${qs ? "?" + qs : ""}`;
      const token = getToken();
      const headers = {};
      if (token) headers["Authorization"] = "Bearer " + token;
      const r = await fetch(url, { headers });
      if (r.status === 401) { redirectToLogin(); return; }
      if (!r.ok) throw new Error(`xlsx export → ${r.status}`);
      const blob = await r.blob();
      const filename = (r.headers.get("content-disposition") || "")
        .match(/filename="?([^"]+)"?/)?.[1] || "captures.xlsx";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  },
  seed: ({ force = false } = {}) => req("POST", `/api/seed${force ? "?force=1" : ""}`),
};

window.api = api;
