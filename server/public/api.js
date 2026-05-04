// api.js — REST client (shared by viewer/admin/captures)
"use strict";

const API_BASE = ""; // same origin

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(API_BASE + path, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${method} ${path} → ${r.status}: ${txt}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

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
    xlsxUrl: ({ provinceId } = {}) => {
      const q = new URLSearchParams();
      if (provinceId) q.set("provinceId", provinceId);
      const qs = q.toString();
      return `/api/captures.xlsx${qs ? "?" + qs : ""}`;
    },
  },
  seed: ({ force = false } = {}) => req("POST", `/api/seed${force ? "?force=1" : ""}`),
};

window.api = api;
