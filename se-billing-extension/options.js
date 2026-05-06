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
  const url = r.ok ? r.url : "https://billing.sesurvey.cloud";
  $("server-url").value = url;
  refreshLinks(url);

  const t = await send("get-api-token");
  if (t.ok) $("api-token").value = t.token || "";
}

$("save").addEventListener("click", async () => {
  const url = $("server-url").value.trim();
  const token = $("api-token").value.trim();

  const rUrl = await send("set-server-url", { url });
  if (!rUrl.ok) { setStatus(rUrl.error || "บันทึก URL ล้มเหลว", "err"); return; }

  const rTok = await send("set-api-token", { token });
  if (!rTok.ok) { setStatus(rTok.error || "บันทึก token ล้มเหลว", "err"); return; }

  refreshLinks(rUrl.url);
  const tokMsg = rTok.hasToken ? "+ token" : "(ไม่มี token)";
  setStatus(`บันทึก: ${rUrl.url} ${tokMsg}`, "ok");
});

$("test").addEventListener("click", async () => {
  setStatus("กำลังทดสอบ...", "");
  // /healthz ผ่านได้โดยไม่ต้อง auth — ทดสอบได้แค่ว่า URL ถูก/server ติดต่อได้
  const r = await send("ping-server");
  if (r.ok) {
    setStatus(`✓ เชื่อมต่อสำเร็จ (${r.healthz?.ts || "ok"})`, "ok");
  } else {
    setStatus(`✗ เชื่อมต่อล้มเหลว: ${r.error}`, "err");
  }
});

load();
