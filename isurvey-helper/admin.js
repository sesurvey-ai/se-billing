/**
 * admin.js — Admin page logic
 *
 * - โหลด data จาก chrome.storage.local (seed defaults ถ้า empty)
 * - โหลด provinces / amphurs / tumbons จาก data/*.json (สำหรับ dropdown)
 * - CRUD ทั้ง 6 sections (PROVINCE_FEE_MAP / AMPHUR_FEE_MAP / TUMBON_FEE_MAP /
 *   AMPHUR_FEE_TABLE / enabledProvinces / modifierFees)
 * - Save → chrome.storage.local.set → loader.js detect onChanged → broadcast → live update
 * - Import / Export JSON
 * - Reset to defaults
 */
"use strict";

const CONFIG_KEYS = [
  "PROVINCE_FEE_MAP",
  "AMPHUR_FEE_MAP",
  "TUMBON_FEE_MAP",
  "AMPHUR_FEE_TABLE",
  "modifierFees",
  "enabledProvinces",
];

const TABLE_FIELDS = [
  { key: "SUR_INVEST",    label: "SUR_INVEST (เสนอ)",       required: true,  default: 0  },
  { key: "INS_INVEST_12", label: "INS_INVEST_12 (1-2)",      required: false, default: 500 },
  { key: "INS_INVEST_34", label: "INS_INVEST_34 (3-4)",      required: false, default: 400 },
  { key: "INS_TRANS",     label: "INS_TRANS (พาหนะ)",         required: false, default: 0  },
  { key: "INS_PHOTO_12",  label: "INS_PHOTO_12 (รูป 1-2)",   required: false, default: 50 },
];

// state
let state = {
  PROVINCE_FEE_MAP: {},
  AMPHUR_FEE_MAP: {},
  TUMBON_FEE_MAP: {},
  AMPHUR_FEE_TABLE: {},
  modifierFees: { outOfArea: 50, outOfHours: 100 },
  enabledProvinces: [],
};

let ref = {
  byProvinceId: {},   // { "10": "กรุงเทพมหานคร", ... }
  byAmphurId: {},     // { "1001": "เขตพระนคร", ... }
  byTumbonId: {},     // { "100101": "...", ... }
  amphursList: [],    // [{ amphurID, amphurname, provinceID }, ...]
  tumbonsList: [],    // [{ tumbonID, tumbonname, amphurID, provinceID }, ...]
  provincesList: [],  // [{ provinceID, provincename }, ...]
};

let defaults = null;

// ─── Status helper ───
const statusEl = () => document.getElementById("status");
function showStatus(msg, isError = false) {
  const el = statusEl();
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3000);
}

// ─── Load reference data + state ───
async function loadAll() {
  // Defaults
  const defRes = await fetch(chrome.runtime.getURL("default-data.json"));
  defaults = await defRes.json();

  // Reference data
  const [provRes, ampRes, tumRes] = await Promise.all([
    fetch(chrome.runtime.getURL("data/provinces.json")),
    fetch(chrome.runtime.getURL("data/amphurs.json")),
    fetch(chrome.runtime.getURL("data/tumbons.json")),
  ]);
  const provJson = await provRes.json();
  const ampJson  = await ampRes.json();
  const tumJson  = await tumRes.json();
  ref.provincesList = provJson.data || [];
  ref.amphursList   = ampJson.data || [];
  ref.tumbonsList   = tumJson.data || [];
  ref.provincesList.forEach(p => ref.byProvinceId[p.provinceID] = p.provincename);
  ref.amphursList.forEach(a => ref.byAmphurId[a.amphurID] = a.amphurname);
  ref.tumbonsList.forEach(t => ref.byTumbonId[t.tumbonID] = t.tumbonname);

  // State (seed if missing)
  const stored = await chrome.storage.local.get(CONFIG_KEYS);
  for (const k of CONFIG_KEYS) {
    if (stored[k] === undefined) {
      state[k] = JSON.parse(JSON.stringify(defaults[k]));
      await chrome.storage.local.set({ [k]: state[k] });
    } else {
      state[k] = stored[k];
    }
  }
}

// ─── Tab switching ───
function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== target));
    });
  });
}

// ─── Helpers ───
function provinceIdFromAmphurId(amphurID) {
  return amphurID.substring(0, 2);
}
function amphurIdFromTumbonId(tumbonID) {
  return tumbonID.substring(0, 4);
}
function provinceLabel(pid) {
  const name = ref.byProvinceId[pid] || "(ไม่พบ)";
  return `${pid} ${name}`;
}
function amphurLabel(aid) {
  const name = ref.byAmphurId[aid] || "(ไม่พบ)";
  return `${aid} ${name}`;
}
function tumbonLabel(tid) {
  const name = ref.byTumbonId[tid] || "(ไม่พบ)";
  return `${tid} ${name}`;
}

// ─── Render: AMPHUR_FEE_TABLE ───
function renderAmphurTable() {
  const search = (document.getElementById("search-amphur-table").value || "").trim().toLowerCase();
  const tbody = document.querySelector("#table-amphur-table tbody");
  const empty = document.getElementById("empty-amphur-table");
  tbody.innerHTML = "";
  const ids = Object.keys(state.AMPHUR_FEE_TABLE).sort();
  let count = 0;
  for (const id of ids) {
    const name = ref.byAmphurId[id] || "(ไม่พบ)";
    if (search) {
      if (!id.includes(search) && !name.toLowerCase().includes(search)) continue;
    }
    count++;
    const row = state.AMPHUR_FEE_TABLE[id];
    const pid = provinceIdFromAmphurId(id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${ref.byProvinceId[pid] || pid}</td>
      <td>${name}</td>
      <td class="numeric">${row.SUR_INVEST ?? "—"}</td>
      <td class="numeric">${row.INS_INVEST_12 ?? "—"}</td>
      <td class="numeric">${row.INS_INVEST_34 ?? "—"}</td>
      <td class="numeric">${row.INS_TRANS ?? "—"}</td>
      <td class="numeric">${row.INS_PHOTO_12 ?? "—"}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-amphur-table" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-amphur-table" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", count > 0);
}

// ─── Render: PROVINCE_FEE_MAP ───
function renderProvinceMap() {
  const tbody = document.querySelector("#table-province-map tbody");
  const empty = document.getElementById("empty-province-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.PROVINCE_FEE_MAP).sort();
  for (const id of ids) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${ref.byProvinceId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.PROVINCE_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-province-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-province-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

// ─── Render: AMPHUR_FEE_MAP ───
function renderAmphurMap() {
  const tbody = document.querySelector("#table-amphur-map tbody");
  const empty = document.getElementById("empty-amphur-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.AMPHUR_FEE_MAP).sort();
  for (const id of ids) {
    const pid = provinceIdFromAmphurId(id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${ref.byProvinceId[pid] || pid}</td>
      <td>${ref.byAmphurId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.AMPHUR_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-amphur-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-amphur-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

// ─── Render: TUMBON_FEE_MAP ───
function renderTumbonMap() {
  const tbody = document.querySelector("#table-tumbon-map tbody");
  const empty = document.getElementById("empty-tumbon-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.TUMBON_FEE_MAP).sort();
  for (const id of ids) {
    const aid = amphurIdFromTumbonId(id);
    const pid = provinceIdFromAmphurId(aid);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${ref.byProvinceId[pid] || pid}</td>
      <td>${ref.byAmphurId[aid] || aid}</td>
      <td>${ref.byTumbonId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.TUMBON_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-tumbon-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-tumbon-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

// ─── Render: enabledProvinces ───
function renderEnabled() {
  const container = document.getElementById("enabled-list");
  container.innerHTML = "";
  const set = new Set(state.enabledProvinces);
  for (const p of ref.provincesList) {
    const label = document.createElement("label");
    const checked = set.has(p.provinceID) ? "checked" : "";
    label.innerHTML = `<input type="checkbox" data-province="${p.provinceID}" ${checked}/> ${p.provinceID} ${p.provincename}`;
    container.appendChild(label);
  }
  container.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", async () => {
      const pid = cb.dataset.province;
      const set = new Set(state.enabledProvinces);
      if (cb.checked) set.add(pid); else set.delete(pid);
      state.enabledProvinces = Array.from(set).sort();
      await chrome.storage.local.set({ enabledProvinces: state.enabledProvinces });
      showStatus(`บันทึก: ${cb.checked ? "เปิด" : "ปิด"} ${pid}`);
    });
  });
}

// ─── Render: modifierFees ───
function renderModifiers() {
  document.getElementById("mod-outOfArea").value  = state.modifierFees.outOfArea  ?? 50;
  document.getElementById("mod-outOfHours").value = state.modifierFees.outOfHours ?? 100;
}

// ─── Master render ───
function renderAll() {
  renderAmphurTable();
  renderProvinceMap();
  renderAmphurMap();
  renderTumbonMap();
  renderEnabled();
  renderModifiers();
}

// ─── Modal helpers ───
function openModal(title, bodyHtml, onSave) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal").classList.remove("hidden");
  const saveBtn = document.getElementById("modal-save");
  const cancelBtn = document.getElementById("modal-cancel");
  const close = () => document.getElementById("modal").classList.add("hidden");
  cancelBtn.onclick = close;
  saveBtn.onclick = async () => {
    const ok = await onSave();
    if (ok) close();
  };
}

function readNumberInput(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = el.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── Add/Edit AMPHUR_FEE_TABLE ───
function openAmphurTableModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.AMPHUR_FEE_TABLE[id] : {};

  // Province dropdown — filter from amphurs.json
  const provinceOptions = ref.provincesList
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");

  const fieldsHtml = TABLE_FIELDS.map(f => `
    <div class="form-row">
      <label>${f.label}${f.required ? " *" : ""}</label>
      <input type="number" id="fld-${f.key}" min="0" value="${existing[f.key] ?? (isEdit ? "" : f.default)}" />
    </div>
  `).join("");

  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>
        ${provinceOptions}
      </select>
    </div>
    <div class="form-row">
      <label>อำเภอ *</label>
      <select id="sel-amphur" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือกจังหวัดก่อน --</option>
      </select>
      <span class="error-msg" id="err-amphur"></span>
    </div>
    <div class="form-grid">
      ${fieldsHtml}
    </div>
  `;

  openModal(isEdit ? `แก้ ${id} ${ref.byAmphurId[id] || ""}` : "เพิ่มอำเภอ (Multi-field)", body, async () => {
    const amphurID = isEdit ? id : document.getElementById("sel-amphur").value;
    if (!amphurID) {
      document.getElementById("err-amphur").textContent = "กรุณาเลือกอำเภอ";
      return false;
    }
    if (!isEdit && state.AMPHUR_FEE_TABLE[amphurID]) {
      document.getElementById("err-amphur").textContent = "อำเภอนี้มีอยู่แล้ว — แก้ไขจากตาราง";
      return false;
    }
    const obj = {};
    for (const f of TABLE_FIELDS) {
      const v = readNumberInput(`fld-${f.key}`);
      if (f.required && v === null) {
        return false;
      }
      if (v !== null) obj[f.key] = v;
    }
    state.AMPHUR_FEE_TABLE[amphurID] = obj;
    await chrome.storage.local.set({ AMPHUR_FEE_TABLE: state.AMPHUR_FEE_TABLE });
    renderAmphurTable();
    showStatus(`บันทึก ${amphurID} ${ref.byAmphurId[amphurID] || ""}`);
    return true;
  });

  // Wire province → amphur dropdown
  if (!isEdit) {
    const provSel = document.getElementById("sel-province");
    const ampSel  = document.getElementById("sel-amphur");
    provSel.addEventListener("change", () => {
      const pid = provSel.value;
      ampSel.innerHTML = '<option value="">-- เลือก --</option>';
      if (!pid) return;
      ref.amphursList
        .filter(a => a.amphurID.startsWith(pid))
        .forEach(a => {
          const opt = document.createElement("option");
          opt.value = a.amphurID;
          opt.textContent = `${a.amphurID} ${a.amphurname}`;
          ampSel.appendChild(opt);
        });
    });
  }
}

// ─── Add/Edit PROVINCE_FEE_MAP ───
function openProvinceMapModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.PROVINCE_FEE_MAP[id] : null;
  const provinceOptions = ref.provincesList
    .map(p => `<option value="${p.provinceID}" ${isEdit && id === p.provinceID ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>
        ${provinceOptions}
      </select>
      <span class="error-msg" id="err-province"></span>
    </div>
    <div class="form-row">
      <label>SUR_INVEST (บาท) *</label>
      <input type="number" id="fld-fee" min="0" value="${existing ?? ""}" />
    </div>
  `;
  openModal(isEdit ? `แก้ ${id} ${ref.byProvinceId[id] || ""}` : "เพิ่มจังหวัด (Simple)", body, async () => {
    const pid = isEdit ? id : document.getElementById("sel-province").value;
    if (!pid) { document.getElementById("err-province").textContent = "กรุณาเลือก"; return false; }
    if (!isEdit && state.PROVINCE_FEE_MAP[pid] !== undefined) {
      document.getElementById("err-province").textContent = "มีอยู่แล้ว — แก้ไขจากตาราง";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    state.PROVINCE_FEE_MAP[pid] = fee;
    await chrome.storage.local.set({ PROVINCE_FEE_MAP: state.PROVINCE_FEE_MAP });
    renderProvinceMap();
    showStatus(`บันทึก ${pid}`);
    return true;
  });
}

// ─── Add/Edit AMPHUR_FEE_MAP ───
function openAmphurMapModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.AMPHUR_FEE_MAP[id] : null;
  const provinceOptions = ref.provincesList
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>
        ${provinceOptions}
      </select>
    </div>
    <div class="form-row">
      <label>อำเภอ *</label>
      <select id="sel-amphur" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือกจังหวัดก่อน --</option>
      </select>
      <span class="error-msg" id="err-amphur"></span>
    </div>
    <div class="form-row">
      <label>SUR_INVEST (บาท) *</label>
      <input type="number" id="fld-fee" min="0" value="${existing ?? ""}" />
    </div>
  `;
  openModal(isEdit ? `แก้ ${id} ${ref.byAmphurId[id] || ""}` : "เพิ่มอำเภอ override (Simple)", body, async () => {
    const aid = isEdit ? id : document.getElementById("sel-amphur").value;
    if (!aid) { document.getElementById("err-amphur").textContent = "กรุณาเลือก"; return false; }
    if (!isEdit && state.AMPHUR_FEE_MAP[aid] !== undefined) {
      document.getElementById("err-amphur").textContent = "มีอยู่แล้ว";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    state.AMPHUR_FEE_MAP[aid] = fee;
    await chrome.storage.local.set({ AMPHUR_FEE_MAP: state.AMPHUR_FEE_MAP });
    renderAmphurMap();
    showStatus(`บันทึก ${aid}`);
    return true;
  });
  if (!isEdit) {
    const provSel = document.getElementById("sel-province");
    const ampSel  = document.getElementById("sel-amphur");
    provSel.addEventListener("change", () => {
      const pid = provSel.value;
      ampSel.innerHTML = '<option value="">-- เลือก --</option>';
      if (!pid) return;
      ref.amphursList
        .filter(a => a.amphurID.startsWith(pid))
        .forEach(a => {
          const opt = document.createElement("option");
          opt.value = a.amphurID;
          opt.textContent = `${a.amphurID} ${a.amphurname}`;
          ampSel.appendChild(opt);
        });
    });
  }
}

// ─── Add/Edit TUMBON_FEE_MAP ───
function openTumbonMapModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.TUMBON_FEE_MAP[id] : null;
  const provinceOptions = ref.provincesList
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>
        ${provinceOptions}
      </select>
    </div>
    <div class="form-row">
      <label>อำเภอ *</label>
      <select id="sel-amphur" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือกจังหวัดก่อน --</option>
      </select>
    </div>
    <div class="form-row">
      <label>ตำบล *</label>
      <select id="sel-tumbon" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือกอำเภอก่อน --</option>
      </select>
      <span class="error-msg" id="err-tumbon"></span>
    </div>
    <div class="form-row">
      <label>SUR_INVEST (บาท) *</label>
      <input type="number" id="fld-fee" min="0" value="${existing ?? ""}" />
    </div>
  `;
  openModal(isEdit ? `แก้ ${id}` : "เพิ่มตำบล override (Simple)", body, async () => {
    const tid = isEdit ? id : document.getElementById("sel-tumbon").value;
    if (!tid) { document.getElementById("err-tumbon").textContent = "กรุณาเลือก"; return false; }
    if (!isEdit && state.TUMBON_FEE_MAP[tid] !== undefined) {
      document.getElementById("err-tumbon").textContent = "มีอยู่แล้ว";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    state.TUMBON_FEE_MAP[tid] = fee;
    await chrome.storage.local.set({ TUMBON_FEE_MAP: state.TUMBON_FEE_MAP });
    renderTumbonMap();
    showStatus(`บันทึก ${tid}`);
    return true;
  });
  if (!isEdit) {
    const provSel = document.getElementById("sel-province");
    const ampSel  = document.getElementById("sel-amphur");
    const tumSel  = document.getElementById("sel-tumbon");
    provSel.addEventListener("change", () => {
      const pid = provSel.value;
      ampSel.innerHTML = '<option value="">-- เลือก --</option>';
      tumSel.innerHTML = '<option value="">-- เลือกอำเภอก่อน --</option>';
      if (!pid) return;
      ref.amphursList.filter(a => a.amphurID.startsWith(pid)).forEach(a => {
        const opt = document.createElement("option");
        opt.value = a.amphurID;
        opt.textContent = `${a.amphurID} ${a.amphurname}`;
        ampSel.appendChild(opt);
      });
    });
    ampSel.addEventListener("change", () => {
      const aid = ampSel.value;
      tumSel.innerHTML = '<option value="">-- เลือก --</option>';
      if (!aid) return;
      ref.tumbonsList.filter(t => t.tumbonID.startsWith(aid)).forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.tumbonID;
        opt.textContent = `${t.tumbonID} ${t.tumbonname}`;
        tumSel.appendChild(opt);
      });
    });
  }
}

// ─── Action handlers (event delegation) ───
async function handleAction(action, id) {
  const map = {
    "edit-amphur-table": () => openAmphurTableModal(id),
    "edit-province-map": () => openProvinceMapModal(id),
    "edit-amphur-map":   () => openAmphurMapModal(id),
    "edit-tumbon-map":   () => openTumbonMapModal(id),
    "delete-amphur-table": async () => {
      if (!confirm(`ลบ ${id} ${ref.byAmphurId[id] || ""}?`)) return;
      delete state.AMPHUR_FEE_TABLE[id];
      await chrome.storage.local.set({ AMPHUR_FEE_TABLE: state.AMPHUR_FEE_TABLE });
      renderAmphurTable();
      showStatus(`ลบ ${id}`);
    },
    "delete-province-map": async () => {
      if (!confirm(`ลบ ${id} ${ref.byProvinceId[id] || ""}?`)) return;
      delete state.PROVINCE_FEE_MAP[id];
      await chrome.storage.local.set({ PROVINCE_FEE_MAP: state.PROVINCE_FEE_MAP });
      renderProvinceMap();
      showStatus(`ลบ ${id}`);
    },
    "delete-amphur-map": async () => {
      if (!confirm(`ลบ ${id} ${ref.byAmphurId[id] || ""}?`)) return;
      delete state.AMPHUR_FEE_MAP[id];
      await chrome.storage.local.set({ AMPHUR_FEE_MAP: state.AMPHUR_FEE_MAP });
      renderAmphurMap();
      showStatus(`ลบ ${id}`);
    },
    "delete-tumbon-map": async () => {
      if (!confirm(`ลบ ${id}?`)) return;
      delete state.TUMBON_FEE_MAP[id];
      await chrome.storage.local.set({ TUMBON_FEE_MAP: state.TUMBON_FEE_MAP });
      renderTumbonMap();
      showStatus(`ลบ ${id}`);
    },
  };
  if (map[action]) await map[action]();
}

// ─── Import / Export ───
function exportJson() {
  const payload = {};
  for (const k of CONFIG_KEYS) payload[k] = state[k];
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  a.href = url;
  a.download = `isurvey-helper-data-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus("Exported");
}

async function importJson(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // basic shape validation
    for (const k of CONFIG_KEYS) {
      if (data[k] === undefined) throw new Error(`ขาด key: ${k}`);
    }
    if (!confirm(`Import จะเขียนทับข้อมูลปัจจุบันทั้งหมด — ต้องการต่อหรือไม่?`)) return;
    for (const k of CONFIG_KEYS) state[k] = data[k];
    await chrome.storage.local.set(data);
    renderAll();
    showStatus("Imported");
  } catch (e) {
    showStatus("Import error: " + e.message, true);
  }
}

// ─── Reset to defaults ───
async function resetToDefaults() {
  if (!confirm("Reset ทุกอย่างกลับเป็นค่า default — ข้อมูลที่เพิ่ม/แก้ไว้จะหายทั้งหมด ต้องการต่อหรือไม่?")) return;
  for (const k of CONFIG_KEYS) state[k] = JSON.parse(JSON.stringify(defaults[k]));
  const obj = {};
  for (const k of CONFIG_KEYS) obj[k] = state[k];
  await chrome.storage.local.set(obj);
  renderAll();
  showStatus("Reset เรียบร้อย");
}

// ─── Wire up ───
async function main() {
  setupTabs();
  await loadAll();
  renderAll();

  // Add buttons
  document.getElementById("add-amphur-table").onclick = () => openAmphurTableModal();
  document.getElementById("add-province-map").onclick = () => openProvinceMapModal();
  document.getElementById("add-amphur-map").onclick   = () => openAmphurMapModal();
  document.getElementById("add-tumbon-map").onclick   = () => openTumbonMapModal();

  // Search
  document.getElementById("search-amphur-table").addEventListener("input", renderAmphurTable);

  // Modifier save
  document.getElementById("save-modifiers").onclick = async () => {
    const a = readNumberInput("mod-outOfArea");
    const h = readNumberInput("mod-outOfHours");
    if (a === null || h === null) { showStatus("กรอกตัวเลขให้ครบ", true); return; }
    state.modifierFees = { outOfArea: a, outOfHours: h };
    await chrome.storage.local.set({ modifierFees: state.modifierFees });
    showStatus("บันทึก modifier");
  };

  // Header actions
  document.getElementById("btn-export").onclick = exportJson;
  document.getElementById("btn-import").onclick = () => document.getElementById("import-file").click();
  document.getElementById("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("btn-reset").onclick = resetToDefaults;

  // Event delegation for table actions
  document.querySelector("main").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) handleAction(btn.dataset.action, btn.dataset.id);
  });

  // Modal backdrop close
  document.querySelector(".modal-backdrop").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
  });
}

main().catch(e => {
  console.error(e);
  showStatus("Error: " + e.message, true);
});
