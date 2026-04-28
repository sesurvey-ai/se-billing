/**
 * content.js  —  I Survey Auto-Fill Helper
 * ─────────────────────────────────────────────────────────────
 * รันใน MAIN world เพื่อให้เข้าถึง global `Ext` ของหน้าเว็บได้
 *
 * Lookup precedence (เฉพาะเจาะจงสุดชนะ):
 *      tumbonID  >  amphurID  >  provinceID
 *
 * สูตรค่าบริการสุดท้าย:
 *      base (จาก *_FEE_MAP)
 *    + outOfArea modifier (ถ้า checkbox "นอกพื้นที่" ติ๊ก)
 *    + outOfHours modifier (ถ้า radio "นอก" ถูกเลือก)
 *
 * โครงสร้างเป็นฟังก์ชันย่อย ๆ เพื่อให้ขยายฟีเจอร์อื่นได้ง่าย
 */
(function () {
  "use strict";

  // ── Guard: ป้องกันการรันซ้ำเมื่อ script ถูก inject สองครั้ง ──
  if (window.__iSurveyHelperLoaded) return;
  window.__iSurveyHelperLoaded = true;

  // ── ดึง config จาก config.js (รันก่อนหน้าใน MAIN world) ──
  const PROVINCE_MAP = window.PROVINCE_FEE_MAP || {};
  const AMPHUR_MAP   = window.AMPHUR_FEE_MAP   || {};
  const TUMBON_MAP   = window.TUMBON_FEE_MAP   || {};

  const CFG = Object.assign(
    {
      pollIntervalMs: 500,
      highlightColor: "#fff59d",
      highlightDurationMs: 1500,
      debug: true,
      enabledProvinces: [],
      modifierFees: { outOfArea: 0, outOfHours: 0 },
      selectors: {},
    },
    window.ISURVEY_HELPER_CONFIG || {}
  );

  const SEL = Object.assign(
    {
      provinceHidden:   'input[type="hidden"][name="tab1_survey_provinceID"]',
      amphurHidden:     'input[type="hidden"][name="tab1_survey_amphurID"]',
      tumbonHidden:     'input[type="hidden"][name="tab1_survey_tumbonID"]',
      feeInput:         'input#tab1_SUR_INVEST-inputEl',
      feeCmpId:         'tab1_SUR_INVEST',
      outOfAreaCmpId:   'tab1_chk_co_area',
      inOutGroupCmpId:  'tab1_grd-in_out',
      outOfAreaInput:   'input#tab1_chk_co_area-inputEl',
      inOutRadioName:   'tab1_rd-in_out',
      outValueLabel:    'นอก',
    },
    CFG.selectors || {}
  );

  const TAG = "[ISurveyHelper]";
  const log  = (...a) => CFG.debug && console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ─────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────

  function isSameNumeric(a, b) {
    if (a === null || a === undefined || a === "") return false;
    if (b === null || b === undefined || b === "") return false;
    const na = parseFloat(String(a).replace(/,/g, ""));
    const nb = parseFloat(String(b).replace(/,/g, ""));
    if (isNaN(na) || isNaN(nb)) return false;
    return Math.abs(na - nb) < 0.0001;
  }

  function flashHighlight(el) {
    if (!el) return;
    const prevBg = el.style.backgroundColor;
    const prevTransition = el.style.transition;
    el.style.transition = "background-color 0.6s ease";
    el.style.backgroundColor = CFG.highlightColor;
    setTimeout(() => {
      el.style.backgroundColor = prevBg || "";
      setTimeout(() => {
        el.style.transition = prevTransition || "";
      }, 700);
    }, CFG.highlightDurationMs);
  }

  function getExtCmp(id) {
    try {
      return (typeof Ext !== "undefined" && Ext.getCmp) ? Ext.getCmp(id) : null;
    } catch (e) {
      warn("Ext.getCmp error for", id, e);
      return null;
    }
  }

  function setFieldValue(cmpId, domEl, value) {
    const cmp = getExtCmp(cmpId);
    if (cmp && typeof cmp.setValue === "function") {
      cmp.setValue(value);
      return "ext";
    }
    if (domEl) {
      domEl.value = value;
      domEl.dispatchEvent(new Event("input", { bubbles: true }));
      domEl.dispatchEvent(new Event("change", { bubbles: true }));
      return "dom";
    }
    return null;
  }

  function readHiddenValue(selector) {
    const el = document.querySelector(selector);
    return el ? (el.value || "") : "";
  }

  function lookupName(level, id) {
    const ref = window.__ISURVEY_REF__;
    if (!ref || !id) return "";
    const dict =
      level === "tumbon"   ? ref.byTumbonId :
      level === "amphur"   ? ref.byAmphurId :
      level === "province" ? ref.byProvinceId :
      null;
    return (dict && dict[String(id)]) || "";
  }

  // ─────────────────────────────────────────────────────────
  // Lookup base fee (province/amphur/tumbon)
  // ─────────────────────────────────────────────────────────

  function lookupFee(provinceId, amphurId, tumbonId) {
    if (tumbonId && Object.prototype.hasOwnProperty.call(TUMBON_MAP, tumbonId)) {
      return { fee: TUMBON_MAP[tumbonId], level: "tumbon", id: tumbonId };
    }
    if (amphurId && Object.prototype.hasOwnProperty.call(AMPHUR_MAP, amphurId)) {
      return { fee: AMPHUR_MAP[amphurId], level: "amphur", id: amphurId };
    }
    if (provinceId && Object.prototype.hasOwnProperty.call(PROVINCE_MAP, provinceId)) {
      return { fee: PROVINCE_MAP[provinceId], level: "province", id: provinceId };
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────
  // Modifier checkers (เพิ่ม modifier ใหม่ตรงนี้ได้)
  // คืน array ของ {key, label, amount} เฉพาะตัวที่ active
  // ─────────────────────────────────────────────────────────

  function isOutOfAreaChecked() {
    const cmp = getExtCmp(SEL.outOfAreaCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      return cmp.getValue() === true;
    }
    // fallback DOM
    const cb = document.querySelector(SEL.outOfAreaInput);
    return !!(cb && cb.checked);
  }

  function isOutOfHoursSelected() {
    // Ext path: radiogroup.getValue() = { tab1_rd-in_out: "ใน" | "นอก" }
    const grp = getExtCmp(SEL.inOutGroupCmpId);
    if (grp && typeof grp.getValue === "function") {
      const v = grp.getValue();
      if (v && v[SEL.inOutRadioName] === SEL.outValueLabel) return true;
      if (v && v[SEL.inOutRadioName] !== undefined) return false;
    }
    // fallback DOM: หา radio ที่ checked แล้วเทียบ label
    const checked = document.querySelector(
      `input[type="radio"][name="${SEL.inOutRadioName}"]:checked`
    );
    if (!checked) return false;
    const labelEl = checked.closest(".x-form-type-radio")?.querySelector(".x-form-cb-label");
    return labelEl ? labelEl.textContent.trim() === SEL.outValueLabel : false;
  }

  function getActiveModifiers() {
    const m = CFG.modifierFees || {};
    const list = [];
    if (m.outOfArea && isOutOfAreaChecked()) {
      list.push({ key: "outOfArea", label: "นอกพื้นที่", amount: m.outOfArea });
    }
    if (m.outOfHours && isOutOfHoursSelected()) {
      list.push({ key: "outOfHours", label: "นอกเวลา", amount: m.outOfHours });
    }
    return list;
  }

  // ─────────────────────────────────────────────────────────
  // Sync: คำนวณ fee สุดท้าย แล้ว setValue ถ้าต่างจากของเดิม
  // ─────────────────────────────────────────────────────────

  function isProvinceEnabled(provinceId) {
    const allow = CFG.enabledProvinces || [];
    if (!allow.length) return true;          // [] = อนุญาตทุกจังหวัด
    return allow.includes(String(provinceId));
  }

  function syncFeeFromLocation() {
    const feeEl = document.querySelector(SEL.feeInput);
    if (!feeEl) return;

    const provinceId = readHiddenValue(SEL.provinceHidden);
    const amphurId   = readHiddenValue(SEL.amphurHidden);
    const tumbonId   = readHiddenValue(SEL.tumbonHidden);

    if (!isProvinceEnabled(provinceId)) return; // นอก whitelist → ไม่แตะ

    const base = lookupFee(provinceId, amphurId, tumbonId);
    if (!base) return; // ไม่มีในตาราง

    const mods = getActiveModifiers();
    const total = mods.reduce((sum, m) => sum + m.amount, base.fee);

    if (isSameNumeric(feeEl.value, total)) return; // ตรงแล้ว ข้าม

    const mode = setFieldValue(SEL.feeCmpId, feeEl, total);
    if (!mode) {
      warn("ไม่พบ component/element สำหรับ", SEL.feeCmpId);
      return;
    }

    flashHighlight(feeEl);
    const name = lookupName(base.level, base.id);
    const baseLabel = `${base.level}: ${base.id}${name ? " - " + name : ""}`;
    const modLabel = mods.length
      ? " " + mods.map(m => `+${m.amount} ${m.label}`).join(" ")
      : "";
    log(
      `Set ค่าบริการ = ${total} (base ${base.fee} [${baseLabel}]${modLabel}) [${mode}]`
    );
  }

  // ─────────────────────────────────────────────────────────
  // Watchers: location hidden inputs + modifier inputs + polling
  // ─────────────────────────────────────────────────────────

  const observers = new Map();

  function attachObserverFor(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;

    const prev = observers.get(selector);
    if (prev && prev.target !== el) {
      prev.observer.disconnect();
      observers.delete(selector);
    } else if (prev) {
      return true;
    }

    const observer = new MutationObserver(() => syncFeeFromLocation());
    observer.observe(el, { attributes: true, attributeFilter: ["value"] });
    observers.set(selector, { observer, target: el });
    log("MutationObserver attached:", selector);
    return true;
  }

  function attachAllLocationObservers() {
    attachObserverFor(SEL.provinceHidden);
    attachObserverFor(SEL.amphurHidden);
    attachObserverFor(SEL.tumbonHidden);
  }

  /**
   * Listener แบบ delegated สำหรับ checkbox/radio ของ modifier
   * ติดครั้งเดียวที่ document — ไม่ต้องผูกใหม่ตอน DOM เปลี่ยน
   */
  function attachModifierListeners() {
    if (window.__iSurveyHelperModifierListenerAttached) return;
    window.__iSurveyHelperModifierListenerAttached = true;

    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t) return;
      const isOutOfAreaCb =
        t.id === SEL.outOfAreaInput.replace(/^input/, "").replace(/^#/, "") ||
        (t.type === "checkbox" && t.id === "tab1_chk_co_area-inputEl");
      const isInOutRadio =
        t.type === "radio" && t.name === SEL.inOutRadioName;
      if (isOutOfAreaCb || isInOutRadio) {
        // sync ทันทีหลัง Ext กระจาย event ภายใน
        setTimeout(syncFeeFromLocation, 0);
      }
    }, true);
    log("Modifier change-listener attached (delegated on document)");
  }

  function startPolling() {
    setInterval(() => {
      attachAllLocationObservers();
      syncFeeFromLocation();
    }, CFG.pollIntervalMs);
  }

  // ─────────────────────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────────────────────

  function init() {
    const allow = CFG.enabledProvinces || [];
    log(
      `Loaded v1.2.0. mappings: ` +
        `province=${Object.keys(PROVINCE_MAP).length}, ` +
        `amphur=${Object.keys(AMPHUR_MAP).length}, ` +
        `tumbon=${Object.keys(TUMBON_MAP).length}, ` +
        `enabledProvinces=${allow.length ? "[" + allow.join(",") + "]" : "ALL"}, ` +
        `modifiers={outOfArea:+${CFG.modifierFees.outOfArea}, outOfHours:+${CFG.modifierFees.outOfHours}}, ` +
        `poll=${CFG.pollIntervalMs}ms`
    );

    if (window.__ISURVEY_REF__) {
      const c = window.__ISURVEY_REF__.counts;
      log(`Reference data ready: ${c.provinces} จังหวัด, ${c.amphurs} อำเภอ, ${c.tumbons} ตำบล`);
    } else {
      window.addEventListener("isurvey-ref-ready", () => {
        const c = window.__ISURVEY_REF__?.counts;
        if (c) log(`Reference data ready: ${c.provinces} จังหวัด, ${c.amphurs} อำเภอ, ${c.tumbons} ตำบล`);
      }, { once: true });
    }

    attachAllLocationObservers();
    attachModifierListeners();
    syncFeeFromLocation();
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
