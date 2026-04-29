/**
 * feature-out-of-hours-amount.js
 * ─────────────────────────────────────────────────────────────
 * UI helper สำหรับ radiogroup "ใน/นอกเวลางาน" (tab1_grd-in_out)
 *
 *  เมื่อเลือก "นอก"  → แทรก numberfield "ยอดเงิน (บาท)" ต่อท้าย radiogroup
 *                      ในแถวเดียวกัน (parent เป็น hbox layout)
 *  เมื่อเลือก "ใน"   → ลบ numberfield
 *
 * ใช้ ExtJS 6.2.0 API: Ext.getCmp / container.insert / field.destroy
 *
 * รันใน MAIN world (ไฟล์นี้ถูก inject พร้อม content.js / config.js)
 */
(function () {
  "use strict";

  // ── ค่าคงที่ (แก้ได้ตามต้องการ) ──────────────────────────
  const GROUP_ID         = "tab1_grd-in_out";       // radiogroup
  const RADIO_NAME       = "tab1_rd-in_out";        // input[name=...]
  const OUT_LABEL        = "นอก";                    // inputValue ของ radio "นอก"
  const FIELD_ID         = "tab1_rd_out_amount";    // numberfield ที่จะสร้าง
  const FIELD_WIDTH      = 102;
  const POLL_INTERVAL_MS = 500;

  const TAG = "[OutOfHours]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  function buildFieldConfig() {
    return {
      id: FIELD_ID,
      name: FIELD_ID,
      xtype: "numberfield",
      hideLabel: true,                    // ใช้ label "ใน/นอกเวลางาน" ของ radiogroup แทน
      emptyText: "ยอดเงิน (บาท)",
      minValue: 0,
      allowDecimals: true,
      decimalPrecision: 2,
      hideTrigger: true,
      width: FIELD_WIDTH,
      margin: "0 0 0 0",
    };
  }

  /**
   * Init feature สำหรับ radiogroup ที่ส่งเข้ามา
   * เรียกซ้ำได้ — มี guard ภายในคุม state
   */
  function init(grp) {
    // ── สร้าง numberfield ต่อท้าย radiogroup ──
    function showAmountField() {
      log("showAmountField() called");

      // idempotent — ลบของเก่าก่อนเสมอ
      const existing = Ext.getCmp(FIELD_ID);
      if (existing) {
        log("destroying existing field");
        existing.destroy();
      }

      const parent = grp.ownerCt || grp.up("panel") || grp.up();
      if (!parent) {
        warn("ไม่พบ parent ของ radiogroup — ทำอะไรไม่ได้");
        return;
      }
      log("parent:", parent.id, "xtype=" + parent.xtype, "layout=" + (parent.layout && parent.layout.type), "items=" + parent.items.getCount());

      const idx = parent.items.indexOf(grp);
      const insertAt = idx >= 0 ? idx + 1 : parent.items.getCount();
      log("inserting at index " + insertAt + " (radiogroup idx=" + idx + ")");

      let newField;
      try {
        newField = parent.insert(insertAt, buildFieldConfig());
      } catch (e) {
        warn("parent.insert ล้มเหลว:", e);
        return;
      }
      log("inserted:", newField ? newField.id : "<null>", "rendered=" + (newField && newField.rendered));
    }

    // ── ลบ numberfield ──
    function removeAmountField() {
      const existing = Ext.getCmp(FIELD_ID);
      if (existing) existing.destroy();
    }

    // ── handler ของ event 'change' ของ radiogroup ──
    // value = { "tab1_rd-in_out": "ใน" | "นอก" }
    function onGroupChange(_g, newValue) {
      const out = !!(newValue && newValue[RADIO_NAME] === OUT_LABEL);
      log("group change → " + (out ? OUT_LABEL : "ใน"));
      if (out) showAmountField();
      else removeAmountField();
    }

    // ── ป้องกัน duplicate listener ──
    if (grp.__outOfHoursHandler) {
      grp.un("change", grp.__outOfHoursHandler);
    }
    grp.__outOfHoursHandler = onGroupChange;
    grp.on("change", onGroupChange);

    // sync state ปัจจุบันทันที
    onGroupChange(grp, grp.getValue());

    log("initialized");
  }

  // ─────────────────────────────────────────────────────────
  // Bootstrap: poll ตลอดเวลา (เลียนแบบ feature-out-of-area-amount.js)
  // ─────────────────────────────────────────────────────────

  function tryFindGroup() {
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") return null;
    return Ext.getCmp(GROUP_ID);
  }

  let lastGrp = null;

  function pollOnce() {
    const grp = tryFindGroup();
    if (!grp) return;

    // instance เดิม + ผูกแล้ว → ข้าม
    if (grp === lastGrp && grp.__outOfHoursHandler) return;

    lastGrp = grp;
    init(grp);
  }

  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (continuous polling every " + POLL_INTERVAL_MS + "ms)";
})();
