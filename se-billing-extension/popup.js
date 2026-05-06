/**
 * popup.js — Per-user province preference UI
 *
 * คลิก extension icon → popup เด้ง → user ติ๊กเลือกจังหวัดที่ใช้งานประจำ
 * บันทึกใน chrome.storage.local key "userProvincePreferences" (string[])
 *
 * loader.js ฟัง chrome.storage.onChanged → re-broadcast config →
 * content.js apply filter ที่ Ext combobox tab1_survey_provinceID
 *
 * Empty array [] = ไม่กรอง = แสดงครบ 77 จังหวัด
 */
(function () {
  "use strict";

  const STORAGE_KEY = "userProvincePreferences";

  const $ = (sel) => document.querySelector(sel);
  const list   = $("#list");
  const search = $("#search");
  const count  = $("#count");
  const total  = $("#total");
  const status = $("#status");

  let provinces = [];     // [{ provinceID, provincename }, ...]
  let selected  = new Set();

  async function loadProvinces() {
    const url = chrome.runtime.getURL("data/provinces.json");
    const res = await fetch(url);
    const json = await res.json();
    provinces = (json.data || []).slice().sort((a, b) =>
      String(a.provincename).localeCompare(String(b.provincename), "th")
    );
    total.textContent = provinces.length;
  }

  async function loadSelected() {
    const obj = await chrome.storage.local.get(STORAGE_KEY);
    const arr = obj[STORAGE_KEY] || [];
    selected = new Set(arr.map(String));
  }

  async function saveSelected() {
    const arr = Array.from(selected).sort();
    await chrome.storage.local.set({ [STORAGE_KEY]: arr });
    flashStatus(arr.length === 0
      ? "บันทึก: ไม่กรอง (แสดงครบ 77 จังหวัด)"
      : `บันทึก: เลือก ${arr.length} จังหวัด`);
  }

  function flashStatus(msg) {
    status.textContent = msg;
    status.classList.remove("error");
    clearTimeout(flashStatus._t);
    flashStatus._t = setTimeout(() => {
      status.textContent = "เปลี่ยนแปลงมีผลทันที — เลือก 0 = แสดงทั้ง 77 จังหวัด";
    }, 1800);
  }

  function render() {
    list.innerHTML = "";
    for (const p of provinces) {
      const id = String(p.provinceID);
      const label = document.createElement("label");
      label.dataset.search = (p.provincename + " " + id).toLowerCase();
      label.innerHTML =
        `<input type="checkbox" data-id="${id}" ${selected.has(id) ? "checked" : ""} />` +
        `<span class="pid">${id}</span>` +
        `<span class="pname">${p.provincename}</span>`;
      list.appendChild(label);
    }
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", onToggle);
    });
    updateCount();
  }

  function updateCount() { count.textContent = selected.size; }

  async function onToggle(ev) {
    const id = ev.target.dataset.id;
    if (ev.target.checked) selected.add(id);
    else selected.delete(id);
    updateCount();
    await saveSelected();
  }

  function applySearch() {
    const q = (search.value || "").trim().toLowerCase();
    list.querySelectorAll("label").forEach(el => {
      const match = !q || el.dataset.search.includes(q);
      el.classList.toggle("hidden", !match);
    });
  }

  async function selectAll() {
    selected = new Set(provinces.map(p => String(p.provinceID)));
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateCount();
    await saveSelected();
  }

  async function clearAll() {
    selected.clear();
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateCount();
    await saveSelected();
  }

  async function init() {
    try {
      await Promise.all([loadProvinces(), loadSelected()]);
      render();
    } catch (e) {
      status.textContent = "Error: " + (e.message || e);
      status.classList.add("error");
      return;
    }
    search.addEventListener("input", applySearch);
    $("#select-all").addEventListener("click", selectAll);
    $("#clear-all").addEventListener("click", clearAll);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
