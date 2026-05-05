/**
 * config-bridge.js  —  MAIN-world config receiver
 * ─────────────────────────────────────────────────────────────
 * แทน config.js เดิม — ปัจจุบัน data (rates, modifiers, whitelist)
 * เก็บใน chrome.storage.local และ admin page เป็นคนแก้ไข
 *
 * loader.js (ISOLATED) → fetch chrome.storage → postMessage MAIN
 *   ↓
 * config-bridge.js (MAIN, ไฟล์นี้) → set window.X + dispatch event
 *   ↓
 * content.js (MAIN) → read window.X on each sync (live update)
 *
 * Static config (selectors, polling, debug) ยังอยู่ที่นี่ —
 * ไม่เก็บใน storage เพราะเป็น technical config ที่ user ไม่ควรแตะ
 */
(function () {
  "use strict";

  // ── Static config — เปลี่ยนผ่าน developer (ไม่ขึ้นกับ admin page) ──
  const STATIC_CONFIG = {
    pollIntervalMs: 500,
    highlightColor: "#fff59d",
    highlightDurationMs: 1500,
    debug: true,
    selectors: {
      provinceHidden:    'input[type="hidden"][name="tab1_survey_provinceID"]',
      amphurHidden:      'input[type="hidden"][name="tab1_survey_amphurID"]',
      tumbonHidden:      'input[type="hidden"][name="tab1_survey_tumbonID"]',
      feeInput:          'input#tab1_SUR_INVEST-inputEl',
      feeCmpId:          'tab1_SUR_INVEST',
      outOfAreaCmpId:    'tab1_chk_co_area',
      inOutGroupCmpId:   'tab1_grd-in_out',
      outOfAreaInput:    'input#tab1_chk_co_area-inputEl',
      inOutRadioName:    'tab1_rd-in_out',
      outValueLabel:     'นอก',
      outOfHoursAmountCmpId:    'tab1_rd_out_amount',
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
      deductAmountCmpId:   'tab1_deduct_amount',
      deductAmountInputId: 'tab1_deduct_amount-inputEl',
    },
  };

  const ORIGIN = window.location.origin;
  const TAG = "[ISurveyHelper/config]";

  // ── เริ่มต้นด้วย empty maps (loader จะ broadcast data มาภายหลัง) ──
  window.PROVINCE_FEE_MAP = window.PROVINCE_FEE_MAP || {};
  window.AMPHUR_FEE_MAP   = window.AMPHUR_FEE_MAP   || {};
  window.TUMBON_FEE_MAP   = window.TUMBON_FEE_MAP   || {};
  window.AMPHUR_FEE_TABLE = window.AMPHUR_FEE_TABLE || {};

  // ── Static config อยู่ใน window.ISURVEY_HELPER_CONFIG เลย ──
  // dynamic fields (modifierFees, enabledProvinces) จะถูก override โดย bridge payload
  window.ISURVEY_HELPER_CONFIG = Object.assign(
    {
      modifierFees: { outOfArea: 0, outOfHours: 0 }, // จะถูก override
      enabledProvinces: [],                            // จะถูก override
    },
    STATIC_CONFIG,
    window.ISURVEY_HELPER_CONFIG || {}
  );

  // ── ฟัง postMessage จาก loader.js ──
  let received = false;

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__isurveyHelper !== true) return;
    if (d.type !== "config-data-response" || !d.payload) return;

    const p = d.payload;
    window.PROVINCE_FEE_MAP = p.PROVINCE_FEE_MAP || {};
    window.AMPHUR_FEE_MAP   = p.AMPHUR_FEE_MAP   || {};
    window.TUMBON_FEE_MAP   = p.TUMBON_FEE_MAP   || {};
    window.AMPHUR_FEE_TABLE = p.AMPHUR_FEE_TABLE || {};
    if (p.modifierFees) window.ISURVEY_HELPER_CONFIG.modifierFees = p.modifierFees;
    if (p.enabledProvinces) window.ISURVEY_HELPER_CONFIG.enabledProvinces = p.enabledProvinces;

    if (!received) {
      received = true;
      window.dispatchEvent(new CustomEvent("isurvey-config-ready"));
      console.log(TAG, `Config loaded:`,
        `province=${Object.keys(window.PROVINCE_FEE_MAP).length},`,
        `amphur=${Object.keys(window.AMPHUR_FEE_MAP).length},`,
        `tumbon=${Object.keys(window.TUMBON_FEE_MAP).length},`,
        `amphurTable=${Object.keys(window.AMPHUR_FEE_TABLE).length},`,
        `enabledProvinces=${window.ISURVEY_HELPER_CONFIG.enabledProvinces.length}`);
    } else {
      // re-broadcast (e.g. after admin save) — content.js poll picks up new values
      window.dispatchEvent(new CustomEvent("isurvey-config-updated"));
      console.log(TAG, "Config reloaded (live update from admin)");
    }
  });

  // ── ขอข้อมูลจาก loader (เผื่อ loader พร้อมก่อน) + retry ──
  function request() {
    window.postMessage(
      { __isurveyHelper: true, type: "config-data-request" },
      ORIGIN
    );
  }

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
