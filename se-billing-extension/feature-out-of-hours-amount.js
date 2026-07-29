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

  // ─────────────────────────────────────────────────────────
  // โหมด DOM (เว็บใหม่ React+MUI)
  //   radio ทั้งหน้าใช้ name เดียวกันหมด → resolver เจาะจงด้วย label ของกลุ่ม
  //   เลือก "นอก" → แทรกช่องยอดเงินต่อท้ายกลุ่ม ; เลือก "ใน" → ลบทิ้ง
  // ─────────────────────────────────────────────────────────
  function domPollOnce() {
    const R = window.SEResolve, I = window.SEInject;
    if (!R || !I) return;

    const val = R.radioValue("inOutGroupCmpId");
    if (!val) return;                       // ยังหากลุ่มไม่เจอ / ยังไม่เลือก

    if (val === OUT_LABEL) {
      if (!I.get(FIELD_ID)) {
        // เกาะ FormControl ทั้งก้อน เพื่อให้ช่องไปอยู่ท้ายสุดของแถว ไม่แทรกกลาง radio
        const anchorRadio = R.el("inOutGroupCmpId");
        const anchor = (anchorRadio && anchorRadio.closest(".MuiFormControl-root, fieldset")) || anchorRadio;
        if (!anchor) return;
        const f = I.numberField({
          id: FIELD_ID, after: anchor, width: FIELD_WIDTH,
          placeholder: "ยอดเงิน (บาท)", title: "ยอดเงินนอกเวลางาน — เว้นว่างเพื่อใช้ค่าเริ่มต้น",
        });
        if (f) log("แทรกช่องยอดเงิน (โหมด DOM)");
      }
    } else if (I.get(FIELD_ID)) {
      I.remove(FIELD_ID);
      log("เลือก 'ใน' → ลบช่องยอดเงิน");
    }
  }

  let lastGrp = null;
  let lastErr = "";

  function pollOnce() {
    // เว็บใหม่ไม่มี ExtJS → ใช้เส้นทาง DOM
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") {
      try { domPollOnce(); } catch (e) {
        const msg = String(e && e.message || e);
        if (msg !== lastErr) { lastErr = msg; warn("โหมด DOM ล้มเหลว:", e); }
      }
      return;
    }

    const grp = tryFindGroup();
    if (!grp) return;

    // instance เดิม + ผูกแล้ว → ข้าม
    if (grp === lastGrp && grp.__outOfHoursHandler) return;

    lastGrp = grp;
    try { init(grp); } catch (e) {
      const msg = String(e && e.message || e);
      if (msg !== lastErr) { lastErr = msg; warn("init ล้มเหลว:", e); }
    }
  }

  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (continuous polling every " + POLL_INTERVAL_MS + "ms)";
})();
