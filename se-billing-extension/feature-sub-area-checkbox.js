/**
 * feature-sub-area-checkbox.js
 * ─────────────────────────────────────────────────────────────
 * Inject checkbox "ตำบลพิเศษ" ต่อท้าย combobox "อำเภอที่ตรวจสอบ"
 * (tab1_survey_amphurID) เมื่อ amphurId ปัจจุบัน = parentAmphur ของ
 * entry ใน window.TUMBON_FEE_OVERRIDE
 *
 *  เมื่อ amphurId match  → render checkbox label = entry.label (เช่น "บ่อวิน", "พลูตาหลวง")
 *  เมื่อ amphurId ไม่ match → ลบ checkbox + reset state
 *  Toggle checkbox      → content.js syncMultiFields swap entry → ใช้ TUMBON_FEE_OVERRIDE
 *
 * ใช้ ExtJS 6.2.0 API: Ext.getCmp / container.insert / field.destroy
 * รันใน MAIN world
 */
(function () {
  "use strict";

  const AMPHUR_CMP_ID = "tab1_survey_amphurID";
  const CHECKBOX_ID   = "tab1_chk_sub_area";
  const POLL_INTERVAL_MS = 500;

  const TAG  = "[SubAreaCheckbox]";
  const log  = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  function getMap() { return window.TUMBON_FEE_OVERRIDE || {}; }

  /** หา entry override ที่ parentAmphur = amphurId นี้; คืน { tumbonId, entry } หรือ null */
  function findEntry(amphurId) {
    if (!amphurId) return null;
    const m = getMap();
    for (const [tid, entry] of Object.entries(m)) {
      if (String(entry.parentAmphur) === String(amphurId)) {
        return { tumbonId: tid, entry };
      }
    }
    return null;
  }

  function readAmphurId() {
    const el = document.querySelector('input[type="hidden"][name="tab1_survey_amphurID"]');
    return el ? String(el.value || "") : "";
  }

  function buildCheckboxConfig(label) {
    return {
      id: CHECKBOX_ID,
      name: CHECKBOX_ID,
      xtype: "checkbox",
      boxLabel: label,
      hideLabel: true,
      width: 160,
      margin: "0 0 0 8",
    };
  }

  /** insert checkbox ต่อท้าย combobox amphur ใน parent items list */
  function insertCheckbox(label) {
    const amphurCmp = (typeof Ext !== "undefined" && Ext.getCmp)
      ? Ext.getCmp(AMPHUR_CMP_ID) : null;
    if (!amphurCmp) return null;
    const parent = amphurCmp.ownerCt || amphurCmp.up("panel") || amphurCmp.up();
    if (!parent) {
      warn("ไม่พบ parent ของ", AMPHUR_CMP_ID);
      return null;
    }
    const idx = parent.items.indexOf(amphurCmp);
    const insertAt = idx >= 0 ? idx + 1 : parent.items.getCount();
    try {
      const cb = parent.insert(insertAt, buildCheckboxConfig(label));
      log(`inserted checkbox '${label}' (parent=${parent.id}, idx=${insertAt})`);
      return cb;
    } catch (e) {
      warn("parent.insert ล้มเหลว:", e);
      return null;
    }
  }

  function destroyCheckbox() {
    const existing = (typeof Ext !== "undefined" && Ext.getCmp)
      ? Ext.getCmp(CHECKBOX_ID) : null;
    if (existing) {
      existing.destroy();
      log("destroyed checkbox");
    }
  }

  /** อ่าน boxLabel ปัจจุบันจาก checkbox; "" ถ้าไม่มี */
  function readCurrentLabel() {
    const cb = (typeof Ext !== "undefined" && Ext.getCmp)
      ? Ext.getCmp(CHECKBOX_ID) : null;
    return cb && cb.boxLabel ? String(cb.boxLabel) : "";
  }

  /**
   * Sync state ตาม amphurId ปัจจุบัน:
   *  - match → ตรวจว่า checkbox มี + label ตรง entry; ถ้าไม่มี/ไม่ตรง destroy + create ใหม่
   *  - ไม่ match → destroy
   */
  function syncOnce() {
    if (typeof Ext === "undefined" || typeof Ext.getCmp !== "function") return;
    const amphurId = readAmphurId();
    const found = findEntry(amphurId);

    if (!found) {
      destroyCheckbox();
      return;
    }

    const desired = String(found.entry.label || found.tumbonId);
    if (readCurrentLabel() === desired) return; // already in sync
    destroyCheckbox();
    insertCheckbox(desired);
  }

  // Bootstrap: poll ตลอด — amphur combobox อาจ recreate ตอน user เปลี่ยน mode/แท็บ
  syncOnce();
  setInterval(syncOnce, POLL_INTERVAL_MS);

  return TAG + " script loaded (polling every " + POLL_INTERVAL_MS + "ms)";
})();
