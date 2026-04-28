/**
 * feature-out-of-area-amount.js
 * ─────────────────────────────────────────────────────────────
 * UI helper สำหรับ checkbox "นอกพื้นที่" (tab1_chk_co_area)
 *
 *  เมื่อติ๊ก  → แทรก numberfield "ยอดเงิน (บาท)" ต่อท้าย checkbox
 *              ในแถวเดียวกัน + ย่อ width checkbox จาก 400 → 110
 *              เพื่อให้ label "นอกพื้นที่" ชิดกับช่องกรอกเงิน
 *  เมื่อปลด → ลบ numberfield และคืน width checkbox เป็น 400
 *
 * ใช้ ExtJS 6.2.0 API: Ext.getCmp / container.insert / field.destroy
 *
 * รันใน MAIN world (ไฟล์นี้ถูก inject พร้อม content.js / config.js)
 * หรือจะ copy IIFE นี้ไป run ใน DevTools Console ก็ได้ ผลลัพธ์เหมือนกัน
 */
(function () {
  "use strict";

  // ── ค่าคงที่ (แก้ได้ตามต้องการ) ──────────────────────────
  const CHECKBOX_ID     = "tab1_chk_co_area";
  const FIELD_ID        = "tab1_chk_co_area_amount";
  const CHECKED_WIDTH   = 110;   // width ของ checkbox เมื่อมี field ต่อท้าย
  const FIELD_WIDTH     = 102;   // width ของ numberfield ใหม่
  const POLL_INTERVAL_MS = 500;  // ตรวจทุก 500ms ตลอดเวลา

  const TAG = "[OutOfArea]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  /**
   * Config ของ numberfield ใหม่
   * แยกเป็นฟังก์ชันเพื่อให้สร้างใหม่ได้ทุกครั้งโดยไม่ shared state
   */
  function buildFieldConfig() {
    return {
      id: FIELD_ID,
      name: FIELD_ID,
      xtype: "numberfield",
      hideLabel: true,                    // ใช้ label "นอกพื้นที่" ของ checkbox แทน
      emptyText: "ยอดเงิน (บาท)",
      minValue: 0,                        // ห้ามติดลบ
      allowDecimals: true,
      decimalPrecision: 2,
      hideTrigger: true,                  // ซ่อนปุ่ม spinner ขึ้น/ลง
      width: FIELD_WIDTH,
      margin: "0 0 0 0",                  // ติด checkbox ไม่มีระยะห่าง
    };
  }

  /**
   * Init feature สำหรับ checkbox component ที่ส่งเข้ามา
   * เรียกซ้ำได้ — มี guard ภายในคุม state
   */
  function init(cb) {
    // ── เก็บ width เดิมครั้งเดียวต่อ instance ของ component ──
    // (กันกรณี init รันซ้ำหลัง checkbox ถูกย่อแล้ว — จะไม่ overwrite ค่าเดิม)
    if (cb.__outOfAreaOrigWidth === undefined) {
      cb.__outOfAreaOrigWidth = cb.getWidth() || 400;
    }
    const ORIG_WIDTH = cb.__outOfAreaOrigWidth;

    // ── สร้าง numberfield + ย่อ checkbox ──
    function showAmountField() {
      log("showAmountField() called");

      // ลบของเก่าก่อนเสมอ (idempotent — กัน duplicate)
      const existing = Ext.getCmp(FIELD_ID);
      if (existing) {
        log("destroying existing field");
        existing.destroy();
      }

      // หา parent — ลองหลายวิธี เผื่อ component hierarchy ซ้อนกัน
      // ownerCt = immediate parent ใน component tree (เลือกใช้นี่ก่อน)
      // up('panel') = ancestor panel ใกล้ที่สุด (fallback)
      const parent = cb.ownerCt || cb.up("panel") || cb.up();
      if (!parent) {
        warn("ไม่พบ parent ของ checkbox — ทำอะไรไม่ได้");
        return;
      }
      log("parent:", parent.id, "xtype=" + parent.xtype, "layout=" + (parent.layout && parent.layout.type), "items=" + parent.items.getCount());

      // หา index ของ checkbox ใน items แล้วแทรก field ต่อท้าย
      const idx = parent.items.indexOf(cb);
      const insertAt = idx >= 0 ? idx + 1 : parent.items.getCount();
      log("inserting at index " + insertAt + " (checkbox idx=" + idx + ")");

      let newField;
      try {
        newField = parent.insert(insertAt, buildFieldConfig());
      } catch (e) {
        warn("parent.insert ล้มเหลว:", e);
        return;
      }
      log("inserted:", newField ? newField.id : "<null>", "rendered=" + (newField && newField.rendered));

      // ย่อ checkbox ให้ label ชิดช่องกรอก
      cb.setWidth(CHECKED_WIDTH);
      log("checkbox width set to " + CHECKED_WIDTH);
    }

    // ── ลบ numberfield + คืน width ──
    function removeAmountField() {
      const existing = Ext.getCmp(FIELD_ID);
      if (existing) existing.destroy();
      cb.setWidth(ORIG_WIDTH);
    }

    // ── handler ของ event 'change' ──
    function onCheckboxChange(_cb, newValue) {
      log("checkbox change → " + newValue);
      if (newValue === true) showAmountField();
      else removeAmountField();
    }

    // ── ป้องกัน duplicate listener: ลบ handler ตัวเก่าก่อนผูกใหม่ ──
    // (จำเป็นเพราะ cb.un() ต้องใช้ reference เดียวกับที่ผูกไว้)
    if (cb.__outOfAreaHandler) {
      cb.un("change", cb.__outOfAreaHandler);
    }
    cb.__outOfAreaHandler = onCheckboxChange;
    cb.on("change", onCheckboxChange);

    // ── เรียก handler ทันทีเพื่อ sync state ปัจจุบัน ──
    // (เผื่อ checkbox ถูกติ๊กอยู่แล้วตอน script รัน)
    onCheckboxChange(cb, cb.getValue());

    log(`initialized (origWidth=${ORIG_WIDTH})`);
  }

  // ─────────────────────────────────────────────────────────
  // Bootstrap: poll ตลอดเวลา (เลียนแบบ content.js)
  //   ─ Ext มัก destroy/recreate component ตอนเปลี่ยนฟอร์ม/แท็บ
  //   ─ checkbox อาจโผล่หลัง document_idle หลายนาที (form lazy-load)
  //   ─ ถ้า component instance เปลี่ยน (id เดิม แต่ object ใหม่)
  //     ต้อง re-init ผูก handler ใหม่
  // ─────────────────────────────────────────────────────────

  function tryFindCheckbox() {
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") return null;
    return Ext.getCmp(CHECKBOX_ID);
  }

  let lastCb = null;

  function pollOnce() {
    const cb = tryFindCheckbox();
    if (!cb) return;

    // ถ้าเป็น instance เดิมและผูกแล้ว → ข้าม
    if (cb === lastCb && cb.__outOfAreaHandler) return;

    // instance ใหม่ (หรือ instance เดิมแต่ยังไม่ผูก) → init
    lastCb = cb;
    init(cb);
  }

  // ลอง sync ทันที (เผื่อฟอร์มพร้อมแล้ว)
  pollOnce();

  // จากนั้น poll ตลอดไป — checkbox สามารถโผล่/หายได้ทุกเมื่อ
  setInterval(pollOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (continuous polling every " + POLL_INTERVAL_MS + "ms)";
})();
