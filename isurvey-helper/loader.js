/**
 * loader.js  —  ISOLATED-world bridge
 * ─────────────────────────────────────────────────────────────
 * Content scripts ใน MAIN world ไม่มีสิทธิ์เรียก chrome.runtime.getURL()
 * ตัวนี้เลยทำหน้าที่:
 *   1) อยู่ใน ISOLATED world → เรียก chrome.runtime.getURL ได้
 *   2) fetch ไฟล์ JSON อ้างอิง (provinces / amphurs / tumbons)
 *   3) ส่งข้อมูลให้ MAIN world ผ่าน window.postMessage
 *      (ใช้ postMessage แทนการ inject <script> เพราะหน้าเว็บมี CSP เข้ม
 *       ไม่อนุญาต inline script — แม้แต่จาก content script)
 *
 * Protocol:
 *   - ISOLATED → MAIN: { __isurveyHelper: true, type: "ref-data-response", payload }
 *   - MAIN → ISOLATED: { __isurveyHelper: true, type: "ref-data-request" }
 *
 * Loader ทำ 2 อย่าง:
 *   - Auto-broadcast หนึ่งครั้งเมื่อโหลดเสร็จ (กรณี MAIN listener พร้อมแล้ว)
 *   - ตอบกลับเมื่อ MAIN ขอ (กรณี MAIN ยังไม่ได้ผูก listener ตอน auto-broadcast)
 */
(function () {
  "use strict";

  const FILES = {
    provinces: "data/provinces.json",
    amphurs: "data/amphurs.json",
    tumbons: "data/tumbons.json",
  };
  const ORIGIN = window.location.origin;
  const TAG = "[ISurveyHelper/loader]";

  let payload = null;
  let ready = false;

  /** อ่าน JSON แล้วแปลงเป็น lookup map { id: name } */
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

  function broadcast() {
    if (!ready || !payload) return;
    window.postMessage(
      { __isurveyHelper: true, type: "ref-data-response", payload: payload },
      ORIGIN
    );
  }

  // ── ตอบกลับเมื่อ MAIN content.js ขอ ──
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__isurveyHelper !== true) return;
    if (d.type === "ref-data-request") {
      broadcast(); // no-op ถ้ายังไม่ ready (MAIN จะ retry เอง)
    }
  });

  // ── โหลดข้อมูล → set ready → auto-broadcast ──
  (async function () {
    try {
      const [provinces, amphurs, tumbons] = await Promise.all([
        loadAsMap(FILES.provinces, "provinceID", "provincename"),
        loadAsMap(FILES.amphurs,   "amphurID",   "amphurname"),
        loadAsMap(FILES.tumbons,   "tumbonID",   "tumbonname"),
      ]);
      payload = {
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
      ready = true;
      broadcast();
    } catch (e) {
      console.warn(TAG, "failed to load reference JSON:", e);
    }
  })();
})();
