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

  // ── Live readers — อ่าน window.X ทุกครั้ง เพื่อรับ live update จาก admin ──
  // Maps + dynamic fields (modifierFees, enabledProvinces) มาจาก chrome.storage
  // ผ่าน config-bridge.js → set window.X. Static fields (selectors, debug, ฯลฯ)
  // อยู่ใน window.ISURVEY_HELPER_CONFIG ตลอดเพราะ config-bridge.js seed ก่อน content.js
  const getProvinceMap  = () => window.PROVINCE_FEE_MAP || {};
  const getAmphurMap    = () => window.AMPHUR_FEE_MAP   || {};
  const getTumbonMap    = () => window.TUMBON_FEE_MAP   || {};
  const getAmphurTable  = () => window.AMPHUR_FEE_TABLE || {};
  const getCFG = () => Object.assign(
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

  // ── Static config snapshot สำหรับการ init/poll (modifier/whitelist อ่านสด) ──
  const CFG = getCFG();

  const SEL = Object.assign(
    {
      provinceHidden:   'input[type="hidden"][name="tab1_survey_provinceID"]',
      amphurHidden:     'input[type="hidden"][name="tab1_survey_amphurID"]',
      tumbonHidden:     'input[type="hidden"][name="tab1_survey_tumbonID"]',
      feeInput:         'input#tab1_SUR_INVEST-inputEl',
      feeCmpId:         'tab1_SUR_INVEST',
      outOfAreaCmpId:      'tab1_chk_co_area',
      outOfAreaAmountCmpId:'tab1_chk_co_area_amount',          // numberfield ที่ user กรอกยอดเอง (นอกพื้นที่)
      outOfAreaAmountInputId: 'tab1_chk_co_area_amount-inputEl',
      inOutGroupCmpId:     'tab1_grd-in_out',
      outOfAreaInput:      'input#tab1_chk_co_area-inputEl',
      outOfAreaInputId:    'tab1_chk_co_area-inputEl',
      inOutRadioName:      'tab1_rd-in_out',
      outValueLabel:       'นอก',
      outOfHoursAmountCmpId:    'tab1_rd_out_amount',           // numberfield ที่ user กรอกยอดเอง (นอกเวลา)
      outOfHoursAmountInputId:  'tab1_rd_out_amount-inputEl',
      mtypeIdCmpId:        'tab1_claim_MtypeID',
      mtypeIdInput:        'input#tab1_claim_MtypeID-inputEl',
      mtypeIdInputId:      'tab1_claim_MtypeID-inputEl',
      surveyorNameCmpId:   'tab1_surveyor_name',
      surveyorNameInput:   'input#tab1_surveyor_name-inputEl',
      surveyorNameInputId: 'tab1_surveyor_name-inputEl',
      insInvestCmpId:      'tab1_INS_INVEST',
      insInvestInput:      'input#tab1_INS_INVEST-inputEl',
      insTransCmpId:       'tab1_INS_TRANS',
      insTransInput:       'input#tab1_INS_TRANS-inputEl',
      insPhotoCmpId:       'tab1_INS_PHOTO',
      insPhotoInput:       'input#tab1_INS_PHOTO-inputEl',
      deductAmountCmpId:   'tab1_deduct_amount',           // numberfield ที่ user กรอกยอด "หักเงิน"
      deductAmountInputId: 'tab1_deduct_amount-inputEl',
    },
    CFG.selectors || {}
  );

  const TAG = "[ISurveyHelper]";
  const log  = (...a) => CFG.debug && console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ─────────────────────────────────────────────────────────
  // Reference data bridge (postMessage ↔ loader.js ใน ISOLATED)
  // ─────────────────────────────────────────────────────────
  // หน้าเว็บมี CSP เข้ม ห้าม inline <script> เลยใช้ postMessage แทน
  (function setupRefBridge() {
    let received = false;
    const ORIGIN = window.location.origin;

    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const d = ev.data;
      if (!d || d.__isurveyHelper !== true) return;
      if (d.type === "ref-data-response" && !received && d.payload) {
        received = true;
        window.__ISURVEY_REF__ = d.payload;
        window.dispatchEvent(new CustomEvent("isurvey-ref-ready"));
      }
    });

    function request() {
      window.postMessage(
        { __isurveyHelper: true, type: "ref-data-request" },
        ORIGIN
      );
    }

    // ขอทันที + retry สั้น ๆ เผื่อ loader ยัง fetch ไม่เสร็จ
    request();
    let attempts = 0;
    const timer = setInterval(() => {
      if (received || attempts++ > 20) {
        clearInterval(timer);
        return;
      }
      request();
    }, 500);
  })();

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

  /**
   * อ่าน MtypeID ปัจจุบัน → "1"/"2"/"3"/"4" หรือ "" ถ้าว่าง
   *   1 = เคลมสด, 2 = เคลมแห้ง, 3 = ติดตาม, 4 = เจรจาสินไหม
   * พยายาม Ext.getValue() ก่อน (คืน underlying ID); fallback อ่าน text แล้ว map
   */
  const MTYPE_LABEL_TO_ID = {
    "เคลมสด":      "1",
    "เคลมแห้ง":    "2",
    "ติดตาม":      "3",
    "เจรจาสินไหม": "4",
  };
  function readMtypeId() {
    const cmp = getExtCmp(SEL.mtypeIdCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "") return String(v);
    }
    const el = document.querySelector(SEL.mtypeIdInput);
    const txt = el ? (el.value || "").trim() : "";
    return MTYPE_LABEL_TO_ID[txt] || "";
  }

  /**
   * พนักงาน SE? — ตรวจชื่อ surveyor ขึ้นต้นด้วย "se" (case insensitive)
   */
  function isSurveyorSE() {
    let name = "";
    const cmp = getExtCmp(SEL.surveyorNameCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      name = cmp.getValue() || "";
    }
    if (!name) {
      const el = document.querySelector(SEL.surveyorNameInput);
      name = el ? (el.value || "") : "";
    }
    return /^se/i.test(String(name).trim());
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
    const TUMBON_MAP   = getTumbonMap();
    const AMPHUR_MAP   = getAmphurMap();
    const PROVINCE_MAP = getProvinceMap();
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

  /**
   * อ่านยอดเงินที่ user กรอกใน numberfield "นอกพื้นที่"
   * คืน { amount, source } โดย source = "custom" ถ้าได้จาก field, "default" ถ้า fallback
   * - field ไม่มีอยู่ / ว่าง → ใช้ default จาก config (50)
   * - field มีค่าตัวเลขถูกต้อง (รวม 0) → ใช้ค่านั้น
   */
  function getOutOfAreaAmount() {
    const defaultAmt = (getCFG().modifierFees || {}).outOfArea || 0;
    const cmp = getExtCmp(SEL.outOfAreaAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        return { amount: Number(v), source: "custom" };
      }
    }
    return { amount: defaultAmt, source: "default" };
  }

  /**
   * อ่านยอดเงินที่ user กรอกใน numberfield "นอกเวลา"
   * คืน { amount, source } โดย source = "custom" ถ้าได้จาก field, "default" ถ้า fallback
   */
  function getOutOfHoursAmount() {
    const defaultAmt = (getCFG().modifierFees || {}).outOfHours || 0;
    const cmp = getExtCmp(SEL.outOfHoursAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        return { amount: Number(v), source: "custom" };
      }
    }
    return { amount: defaultAmt, source: "default" };
  }

  /**
   * อ่านยอด "หักเงิน" ที่ user กรอกในแถว 7 (inject โดย feature-deduct-amount.js)
   * คืน amount > 0 เมื่อ user กรอก, 0 เมื่อว่าง/ไม่มี field
   * (ไม่มี toggle — field value = 0 หมายความว่า "ไม่หัก")
   */
  function getDeductAmount() {
    const cmp = getExtCmp(SEL.deductAmountCmpId);
    if (cmp && typeof cmp.getValue === "function") {
      const v = cmp.getValue();
      if (v !== null && v !== undefined && v !== "" && !isNaN(v)) {
        const n = Number(v);
        if (n > 0) return n;
      }
    }
    return 0;
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
    const list = [];
    if (isOutOfAreaChecked()) {
      // ค่ามาจาก numberfield ก่อน → fallback default จาก config
      const { amount, source } = getOutOfAreaAmount();
      if (amount !== 0 || source === "custom") {
        // amount 0 ที่ user กรอกเอง = ตั้งใจให้ +0 ก็ใส่ใน list เพื่อ log ให้ครบ
        list.push({
          key: "outOfArea",
          label: source === "custom" ? "นอกพื้นที่ (custom)" : "นอกพื้นที่",
          amount: amount,
        });
      }
    }
    if (isOutOfHoursSelected()) {
      const { amount, source } = getOutOfHoursAmount();
      if (amount !== 0 || source === "custom") {
        list.push({
          key: "outOfHours",
          label: source === "custom" ? "นอกเวลา (custom)" : "นอกเวลา",
          amount: amount,
        });
      }
    }
    // หักเงิน: ไม่มี toggle — value > 0 ก็หัก (negative modifier)
    const deduct = getDeductAmount();
    if (deduct > 0) {
      list.push({ key: "deduct", label: "หักเงิน", amount: -deduct });
    }
    return list;
  }

  // ─────────────────────────────────────────────────────────
  // Sync: คำนวณ fee สุดท้าย แล้ว setValue ถ้าต่างจากของเดิม
  // ─────────────────────────────────────────────────────────

  function isProvinceEnabled(provinceId) {
    const allow = getCFG().enabledProvinces || [];
    if (!allow.length) return true;          // [] = อนุญาตทุกจังหวัด
    return allow.includes(String(provinceId));
  }

  /**
   * ตั้งค่าฟิลด์ตัวเดียว (มี skip-if-same + flash + log) — utility สำหรับ multi-field mode
   * ส่ง value = "" หรือ null → clear ฟิลด์ (ใช้ตอน MtypeID เปลี่ยนแล้วฟิลด์เดิมไม่ valid อีกแล้ว)
   */
  function setOneField(cmpId, sel, value, label) {
    const el = document.querySelector(sel);
    if (!el) return false;

    const isClear = (value === "" || value === null || value === undefined);
    if (isClear) {
      // ถ้าฟิลด์ว่างอยู่แล้ว → ไม่ต้องแตะ (กัน flash ทุกรอบ poll)
      if (!el.value || String(el.value).trim() === "") return false;
    } else {
      if (isSameNumeric(el.value, value)) return false;
    }

    const mode = setFieldValue(cmpId, el, isClear ? "" : value);
    if (!mode) {
      warn("ไม่พบ component/element สำหรับ", cmpId);
      return false;
    }
    flashHighlight(el);
    log(`Set ${label} = ${isClear ? "(cleared)" : value} [${mode}]`);
    return true;
  }

  /**
   * Multi-field mode: ใช้กับอำเภอที่อยู่ใน AMPHUR_FEE_TABLE
   * เติมหลายช่อง (SUR_INVEST / INS_INVEST / INS_TRANS / INS_PHOTO) ตาม MtypeID + SE/non-SE
   */
  function syncMultiFields(amphurId, tbl) {
    const mtype = readMtypeId();
    const isSE  = isSurveyorSE();
    const mt12  = (mtype === "1" || mtype === "2");
    const mt34  = (mtype === "3" || mtype === "4");

    // SUR_INVEST: เฉพาะ SE — ค่าเดียวต่ออำเภอ ทุก MtypeID + บวก modifier "นอกพื้นที่"/"นอกเวลา"
    if (isSE && tbl.SUR_INVEST !== undefined) {
      const mods = getActiveModifiers();
      const total = mods.reduce((sum, m) => sum + m.amount, tbl.SUR_INVEST);
      const modLabel = mods.length
        ? " " + mods.map(m => `${m.amount >= 0 ? "+" : ""}${m.amount} ${m.label}`).join(" ")
        : "";
      setOneField(SEL.feeCmpId, SEL.feeInput, total,
        `SUR_INVEST [amphur ${amphurId}] (base ${tbl.SUR_INVEST}${modLabel})`);
    }

    // INS_INVEST: เลือกตาม MtypeID (1-2 vs 3-4)
    if (mt12 && tbl.INS_INVEST_12 !== undefined) {
      setOneField(SEL.insInvestCmpId, SEL.insInvestInput, tbl.INS_INVEST_12,
        `INS_INVEST [amphur ${amphurId}, MtypeID ${mtype}=เคลม${mtype === "1" ? "สด" : "แห้ง"}]`);
    } else if (mt34 && tbl.INS_INVEST_34 !== undefined) {
      setOneField(SEL.insInvestCmpId, SEL.insInvestInput, tbl.INS_INVEST_34,
        `INS_INVEST [amphur ${amphurId}, MtypeID ${mtype}=${mtype === "3" ? "ติดตาม" : "เจรจาสินไหม"}]`);
    }

    // INS_TRANS: ทุก MtypeID (ขึ้นกับอำเภออย่างเดียว)
    if (tbl.INS_TRANS !== undefined) {
      setOneField(SEL.insTransCmpId, SEL.insTransInput, tbl.INS_TRANS,
        `INS_TRANS [amphur ${amphurId}]`);
    }

    // INS_PHOTO: เฉพาะ MtypeID 1-2 — เมื่อ 3-4 ให้ auto-clear (ป้องกันค่าเก่าค้าง)
    if (mt12 && tbl.INS_PHOTO_12 !== undefined) {
      setOneField(SEL.insPhotoCmpId, SEL.insPhotoInput, tbl.INS_PHOTO_12,
        `INS_PHOTO [amphur ${amphurId}, MtypeID ${mtype}]`);
    } else if (mt34) {
      setOneField(SEL.insPhotoCmpId, SEL.insPhotoInput, "",
        `INS_PHOTO [MtypeID ${mtype} → clear]`);
    }
  }

  /**
   * Simple mode: SUR_INVEST อย่างเดียว (เดิม) — กทม., สมุทรปราการ ฯลฯ
   */
  function syncSurInvestSimple(provinceId, amphurId, tumbonId) {
    const feeEl = document.querySelector(SEL.feeInput);
    if (!feeEl) return;

    const base = lookupFee(provinceId, amphurId, tumbonId);
    if (!base) return; // ไม่มีในตาราง

    const mods = getActiveModifiers();
    const total = mods.reduce((sum, m) => sum + m.amount, base.fee);

    if (isSameNumeric(feeEl.value, total)) return;

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

  /**
   * Entry point: เลือก mode ตามว่า amphurId อยู่ใน AMPHUR_FEE_TABLE หรือไม่
   *   - อยู่ → multi-field (ระยอง)
   *   - ไม่อยู่ → simple SUR_INVEST (กทม. ฯลฯ)
   */
  function syncFeeFromLocation() {
    const provinceId = readHiddenValue(SEL.provinceHidden);
    const amphurId   = readHiddenValue(SEL.amphurHidden);
    const tumbonId   = readHiddenValue(SEL.tumbonHidden);

    if (!isProvinceEnabled(provinceId)) return; // นอก whitelist → ไม่แตะ

    const tbl = getAmphurTable()[amphurId];
    if (tbl) {
      syncMultiFields(amphurId, tbl);
      return;
    }

    syncSurInvestSimple(provinceId, amphurId, tumbonId);
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

    // 'change' = checkbox / radio / numberfield (blur) / combobox / text input
    document.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t) return;
      const matches =
        t.id === SEL.outOfAreaInputId ||
        t.id === SEL.outOfAreaAmountInputId ||
        t.id === SEL.outOfHoursAmountInputId ||
        t.id === SEL.deductAmountInputId ||
        t.id === SEL.mtypeIdInputId ||
        t.id === SEL.surveyorNameInputId ||
        (t.type === "radio" && t.name === SEL.inOutRadioName);
      if (matches) {
        // sync ทันทีหลัง Ext กระจาย event ภายใน
        setTimeout(syncFeeFromLocation, 0);
      }
    }, true);

    // 'input' = ขณะ user พิมพ์ใน numberfield (live update)
    document.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t && (
        t.id === SEL.outOfAreaAmountInputId ||
        t.id === SEL.outOfHoursAmountInputId ||
        t.id === SEL.deductAmountInputId
      )) {
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

  function logConfigSnapshot(prefix) {
    const cfg = getCFG();
    const allow = cfg.enabledProvinces || [];
    const mods = cfg.modifierFees || {};
    log(
      `${prefix} mappings: ` +
        `province=${Object.keys(getProvinceMap()).length}, ` +
        `amphur=${Object.keys(getAmphurMap()).length}, ` +
        `tumbon=${Object.keys(getTumbonMap()).length}, ` +
        `amphurTable=${Object.keys(getAmphurTable()).length}, ` +
        `enabledProvinces=${allow.length ? "[" + allow.join(",") + "]" : "ALL"}, ` +
        `modifiers={outOfArea:+${mods.outOfArea || 0}, outOfHours:+${mods.outOfHours || 0}}, ` +
        `poll=${cfg.pollIntervalMs}ms`
    );
  }

  function init() {
    logConfigSnapshot("Loaded.");

    // ฟัง config update จาก admin → log + sync ทันที (ไม่ต้องรอ poll)
    window.addEventListener("isurvey-config-updated", () => {
      logConfigSnapshot("Config updated.");
      syncFeeFromLocation();
    });

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
