"use strict";

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function refreshLinks(url) {
  $("link-viewer").href   = `${url}/`;
  $("link-admin").href    = `${url}/admin`;
  $("link-captures").href = `${url}/captures`;
}

function send(type, data) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...data }, (r) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(r || { ok: false, error: "no response" });
      }
    });
  });
}

async function load() {
  const r = await send("get-server-url");
  const url = r.ok ? r.url : "http://localhost:3200";
  $("server-url").value = url;
  refreshLinks(url);
}

$("save").addEventListener("click", async () => {
  const url = $("server-url").value.trim();
  const r = await send("set-server-url", { url });
  if (r.ok) {
    refreshLinks(r.url);
    setStatus(`บันทึก: ${r.url}`, "ok");
  } else {
    setStatus(r.error || "บันทึกล้มเหลว", "err");
  }
});

$("test").addEventListener("click", async () => {
  setStatus("กำลังทดสอบ...", "");
  const r = await send("ping-server");
  if (r.ok) {
    setStatus(`✓ เชื่อมต่อสำเร็จ (${r.healthz?.ts || "ok"})`, "ok");
  } else {
    setStatus(`✗ เชื่อมต่อล้มเหลว: ${r.error}`, "err");
  }
});

load();
