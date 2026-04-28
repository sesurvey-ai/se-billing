/**
 * loader.js  —  ISOLATED-world bridge
 * ─────────────────────────────────────────────────────────────
 * Content scripts ใน MAIN world ไม่มีสิทธิ์เรียก chrome.runtime.getURL()
 * ตัวนี้เลยทำหน้าที่:
 *   1) อยู่ใน ISOLATED world → เรียก chrome.runtime.getURL ได้
 *   2) fetch ไฟล์ JSON อ้างอิง (provinces / amphurs / tumbons)
 *   3) ฉีด <script> เข้า DOM เพื่อ expose ข้อมูลบน window ของ MAIN world
 *      ภายใต้ key  window.__ISURVEY_REF__  = { provinces, amphurs, tumbons,
 *                                              byProvinceId, byAmphurId, byTumbonId }
 *
 * Note: content.js ใน MAIN world จะอ่านข้อมูลนี้แบบ best-effort
 * ถ้ายังโหลดไม่เสร็จ ฟีเจอร์ auto-fill ยังคงทำงานได้ตามปกติ
 * (แค่ log จะไม่มีชื่อจังหวัด/อำเภอ/ตำบลแสดงคู่กับ ID)
 */
(async function () {
  "use strict";

  const FILES = {
    provinces: "data/provinces.json",
    amphurs: "data/amphurs.json",
    tumbons: "data/tumbons.json",
  };

  /**
   * โหลดและแปลงเป็น lookup map: { id: name }
   * รองรับโครงสร้าง { data: [{ xxxID, xxxname }] } ของระบบ I Survey
   */
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

  let payload;
  try {
    const [provinces, amphurs, tumbons] = await Promise.all([
      loadAsMap(FILES.provinces, "provinceID", "provincename"),
      loadAsMap(FILES.amphurs, "amphurID", "amphurname"),
      loadAsMap(FILES.tumbons, "tumbonID", "tumbonname"),
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
  } catch (e) {
    console.warn("[ISurveyHelper/loader] failed to load reference JSON:", e);
    return;
  }

  // Inject into MAIN world via a <script> tag
  // (ISOLATED window !== MAIN window — share data via DOM only)
  const script = document.createElement("script");
  script.textContent =
    "window.__ISURVEY_REF__ = " + JSON.stringify(payload) + ";" +
    "window.dispatchEvent(new CustomEvent('isurvey-ref-ready'));";
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
