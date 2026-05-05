/**
 * admin.js (server) — CRUD สำหรับ rate config ผ่าน REST API
 * (port มาจาก isurvey-helper/admin.js — เปลี่ยน chrome.storage → fetch)
 */
"use strict";

const TABLE_FIELDS = [
  { key: "SUR_INVEST",    label: "SUR_INVEST (เสนอ)",       required: true,  default: 0  },
  { key: "INS_INVEST_12", label: "INS_INVEST_12 (1-2)",     required: false, default: 500 },
  { key: "INS_INVEST_34", label: "INS_INVEST_34 (3-4)",     required: false, default: 400 },
  { key: "INS_TRANS",     label: "INS_TRANS (พาหนะ)",        required: false, default: 0  },
  { key: "INS_PHOTO_12",  label: "INS_PHOTO_12 (รูป 1-2)",  required: false, default: 50 },
];

let state = {
  config: null,            // PROVINCE_FEE_MAP / AMPHUR_FEE_MAP / TUMBON_FEE_MAP / AMPHUR_FEE_TABLE / enabledProvinces / modifierFees
  ref: null,               // provinces/amphurs/tumbons (lists + maps)
};

const statusEl = () => document.getElementById("status");
function showStatus(msg, isError = false) {
  const el = statusEl();
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 3000);
}

const provinceIdFromAmphurId = (id) => String(id).substring(0, 2);
const amphurIdFromTumbonId   = (id) => String(id).substring(0, 4);

async function loadAll() {
  [state.config, state.ref] = await Promise.all([api.config(), api.reference()]);
}

async function reloadConfig() {
  state.config = await api.config();
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== target));
    });
  });
}

// ─── Render: AMPHUR_FEE_TABLE ───
function renderAmphurTable() {
  const search = (document.getElementById("search-amphur-table").value || "").trim().toLowerCase();
  const tbody = document.querySelector("#table-amphur-table tbody");
  const empty = document.getElementById("empty-amphur-table");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.AMPHUR_FEE_TABLE).sort();
  let count = 0;
  for (const id of ids) {
    const name = state.ref.byAmphurId[id] || "(ไม่พบ)";
    const pid = provinceIdFromAmphurId(id);
    const pname = state.ref.byProvinceId[pid] || pid;
    if (search) {
      const hay = `${id} ${name} ${pname}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }
    count++;
    const row = state.config.AMPHUR_FEE_TABLE[id];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${pname}</td>
      <td>${name}</td>
      <td class="center">${row.SUR_INVEST ?? "—"}</td>
      <td class="center">${row.INS_INVEST_12 ?? "—"}</td>
      <td class="center">${row.INS_INVEST_34 ?? "—"}</td>
      <td class="center">${row.INS_TRANS ?? "—"}</td>
      <td class="center">${row.INS_PHOTO_12 ?? "—"}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-amphur-table" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-amphur-table" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", count > 0);
}

function renderProvinceMap() {
  const tbody = document.querySelector("#table-province-map tbody");
  const empty = document.getElementById("empty-province-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.PROVINCE_FEE_MAP).sort();
  for (const id of ids) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${state.ref.byProvinceId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.config.PROVINCE_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-province-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-province-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderAmphurMap() {
  const tbody = document.querySelector("#table-amphur-map tbody");
  const empty = document.getElementById("empty-amphur-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.AMPHUR_FEE_MAP).sort();
  for (const id of ids) {
    const pid = provinceIdFromAmphurId(id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${state.ref.byProvinceId[pid] || pid}</td>
      <td>${state.ref.byAmphurId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.config.AMPHUR_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-amphur-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-amphur-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderTumbonMap() {
  const tbody = document.querySelector("#table-tumbon-map tbody");
  const empty = document.getElementById("empty-tumbon-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.TUMBON_FEE_MAP).sort();
  for (const id of ids) {
    const aid = amphurIdFromTumbonId(id);
    const pid = provinceIdFromAmphurId(aid);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${state.ref.byProvinceId[pid] || pid}</td>
      <td>${state.ref.byAmphurId[aid] || aid}</td>
      <td>${state.ref.byTumbonId[id] || "(ไม่พบ)"}</td>
      <td class="numeric">${state.config.TUMBON_FEE_MAP[id]}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-tumbon-map" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-tumbon-map" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderEnabled() {
  const container = document.getElementById("enabled-list");
  container.innerHTML = "";
  const set = new Set(state.config.enabledProvinces);
  for (const p of state.ref.provinces) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" data-province="${p.provinceID}" ${set.has(p.provinceID) ? "checked" : ""}/> ${p.provinceID} ${p.provincename}`;
    container.appendChild(label);
  }
  container.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", async () => {
      const cur = new Set(state.config.enabledProvinces);
      const pid = cb.dataset.province;
      if (cb.checked) cur.add(pid); else cur.delete(pid);
      state.config.enabledProvinces = Array.from(cur).sort();
      try {
        await api.enabledProvinces.set(state.config.enabledProvinces);
        showStatus(`บันทึก: ${cb.checked ? "เปิด" : "ปิด"} ${pid}`);
      } catch (e) { showStatus(e.message, true); }
    });
  });
}

function renderModifiers() {
  document.getElementById("mod-outOfArea").value  = state.config.modifierFees.outOfArea  ?? 50;
  document.getElementById("mod-outOfHours").value = state.config.modifierFees.outOfHours ?? 100;
}

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
    try {
      const ok = await onSave();
      if (ok) close();
    } catch (e) { showStatus(e.message, true); }
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
  const existing = isEdit ? state.config.AMPHUR_FEE_TABLE[id] : {};
  const provinceOptions = state.ref.provinces
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
    <div class="form-grid">${fieldsHtml}</div>
  `;

  openModal(isEdit ? `แก้ ${id} ${state.ref.byAmphurId[id] || ""}` : "เพิ่มอำเภอ (Multi-field)", body, async () => {
    const amphurID = isEdit ? id : document.getElementById("sel-amphur").value;
    if (!amphurID) {
      document.getElementById("err-amphur").textContent = "กรุณาเลือกอำเภอ";
      return false;
    }
    if (!isEdit && state.config.AMPHUR_FEE_TABLE[amphurID]) {
      document.getElementById("err-amphur").textContent = "อำเภอนี้มีอยู่แล้ว — แก้ไขจากตาราง";
      return false;
    }
    const obj = {};
    for (const f of TABLE_FIELDS) {
      const v = readNumberInput(`fld-${f.key}`);
      if (f.required && v === null) return false;
      if (v !== null) obj[f.key] = v;
    }
    await api.amphurTable.upsert(amphurID, obj);
    state.config.AMPHUR_FEE_TABLE[amphurID] = obj;
    renderAmphurTable();
    showStatus(`บันทึก ${amphurID} ${state.ref.byAmphurId[amphurID] || ""}`);
    return true;
  });

  if (!isEdit) {
    const provSel = document.getElementById("sel-province");
    const ampSel  = document.getElementById("sel-amphur");
    provSel.addEventListener("change", () => {
      const pid = provSel.value;
      ampSel.innerHTML = '<option value="">-- เลือก --</option>';
      if (!pid) return;
      state.ref.amphurs
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
  const existing = isEdit ? state.config.PROVINCE_FEE_MAP[id] : null;
  const provinceOptions = state.ref.provinces
    .map(p => `<option value="${p.provinceID}" ${isEdit && id === p.provinceID ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>${provinceOptions}
      </select>
      <span class="error-msg" id="err-province"></span>
    </div>
    <div class="form-row">
      <label>SUR_INVEST (บาท) *</label>
      <input type="number" id="fld-fee" min="0" value="${existing ?? ""}" />
    </div>
  `;
  openModal(isEdit ? `แก้ ${id} ${state.ref.byProvinceId[id] || ""}` : "เพิ่มจังหวัด (Simple)", body, async () => {
    const pid = isEdit ? id : document.getElementById("sel-province").value;
    if (!pid) { document.getElementById("err-province").textContent = "กรุณาเลือก"; return false; }
    if (!isEdit && state.config.PROVINCE_FEE_MAP[pid] !== undefined) {
      document.getElementById("err-province").textContent = "มีอยู่แล้ว — แก้ไขจากตาราง";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    await api.provinceRates.upsert(pid, fee);
    state.config.PROVINCE_FEE_MAP[pid] = fee;
    renderProvinceMap();
    showStatus(`บันทึก ${pid}`);
    return true;
  });
}

// ─── Add/Edit AMPHUR_FEE_MAP ───
function openAmphurMapModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.config.AMPHUR_FEE_MAP[id] : null;
  const provinceOptions = state.ref.provinces
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>${provinceOptions}
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
  openModal(isEdit ? `แก้ ${id} ${state.ref.byAmphurId[id] || ""}` : "เพิ่มอำเภอ override (Simple)", body, async () => {
    const aid = isEdit ? id : document.getElementById("sel-amphur").value;
    if (!aid) { document.getElementById("err-amphur").textContent = "กรุณาเลือก"; return false; }
    if (!isEdit && state.config.AMPHUR_FEE_MAP[aid] !== undefined) {
      document.getElementById("err-amphur").textContent = "มีอยู่แล้ว";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    await api.amphurOverrides.upsert(aid, fee);
    state.config.AMPHUR_FEE_MAP[aid] = fee;
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
      state.ref.amphurs
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
  const existing = isEdit ? state.config.TUMBON_FEE_MAP[id] : null;
  const provinceOptions = state.ref.provinces
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>${provinceOptions}
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
    if (!isEdit && state.config.TUMBON_FEE_MAP[tid] !== undefined) {
      document.getElementById("err-tumbon").textContent = "มีอยู่แล้ว";
      return false;
    }
    const fee = readNumberInput("fld-fee");
    if (fee === null) return false;
    await api.tumbonOverrides.upsert(tid, fee);
    state.config.TUMBON_FEE_MAP[tid] = fee;
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
      state.ref.amphurs.filter(a => a.amphurID.startsWith(pid)).forEach(a => {
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
      state.ref.tumbons.filter(t => t.tumbonID.startsWith(aid)).forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.tumbonID;
        opt.textContent = `${t.tumbonID} ${t.tumbonname}`;
        tumSel.appendChild(opt);
      });
    });
  }
}

// ─── Action handlers ───
async function handleAction(action, id) {
  const map = {
    "edit-amphur-table": () => openAmphurTableModal(id),
    "edit-province-map": () => openProvinceMapModal(id),
    "edit-amphur-map":   () => openAmphurMapModal(id),
    "edit-tumbon-map":   () => openTumbonMapModal(id),
    "delete-amphur-table": async () => {
      if (!confirm(`ลบ ${id} ${state.ref.byAmphurId[id] || ""}?`)) return;
      await api.amphurTable.remove(id);
      delete state.config.AMPHUR_FEE_TABLE[id];
      renderAmphurTable();
      showStatus(`ลบ ${id}`);
    },
    "delete-province-map": async () => {
      if (!confirm(`ลบ ${id} ${state.ref.byProvinceId[id] || ""}?`)) return;
      await api.provinceRates.remove(id);
      delete state.config.PROVINCE_FEE_MAP[id];
      renderProvinceMap();
      showStatus(`ลบ ${id}`);
    },
    "delete-amphur-map": async () => {
      if (!confirm(`ลบ ${id} ${state.ref.byAmphurId[id] || ""}?`)) return;
      await api.amphurOverrides.remove(id);
      delete state.config.AMPHUR_FEE_MAP[id];
      renderAmphurMap();
      showStatus(`ลบ ${id}`);
    },
    "delete-tumbon-map": async () => {
      if (!confirm(`ลบ ${id}?`)) return;
      await api.tumbonOverrides.remove(id);
      delete state.config.TUMBON_FEE_MAP[id];
      renderTumbonMap();
      showStatus(`ลบ ${id}`);
    },
  };
  if (map[action]) {
    try { await map[action](); }
    catch (e) { showStatus(e.message, true); }
  }
}

// ─── Import/Export/Reset ───
function exportJson() {
  const c = state.config;
  const payload = {
    PROVINCE_FEE_MAP: c.PROVINCE_FEE_MAP,
    AMPHUR_FEE_MAP:   c.AMPHUR_FEE_MAP,
    TUMBON_FEE_MAP:   c.TUMBON_FEE_MAP,
    AMPHUR_FEE_TABLE: c.AMPHUR_FEE_TABLE,
    enabledProvinces: c.enabledProvinces,
    modifierFees:     c.modifierFees,
  };
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
    const required = ["PROVINCE_FEE_MAP","AMPHUR_FEE_MAP","TUMBON_FEE_MAP","AMPHUR_FEE_TABLE","modifierFees","enabledProvinces"];
    for (const k of required) {
      if (data[k] === undefined) throw new Error(`ขาด key: ${k}`);
    }
    if (!confirm(`Import จะเขียนทับข้อมูลปัจจุบันทั้งหมด — ต้องการต่อหรือไม่?`)) return;
    // Server seedFrom POST - need to add an endpoint OR upload via individual calls
    // For simplicity: POST to /api/seed?force=1 expects default-data.json on disk;
    // here we replicate manually via existing endpoints
    const calls = [];
    // Replace all amphur_table — easier path: clear-and-add per-id
    // Note: api doesn't expose bulk replace for tables; do via per-id upsert + delete missing
    const cur = await api.config();
    // amphur_table
    const oldIds = new Set(Object.keys(cur.AMPHUR_FEE_TABLE));
    const newIds = new Set(Object.keys(data.AMPHUR_FEE_TABLE));
    for (const id of oldIds) if (!newIds.has(id)) calls.push(api.amphurTable.remove(id));
    for (const [id, row] of Object.entries(data.AMPHUR_FEE_TABLE)) calls.push(api.amphurTable.upsert(id, row));
    // province_rates
    const oldP = new Set(Object.keys(cur.PROVINCE_FEE_MAP));
    const newP = new Set(Object.keys(data.PROVINCE_FEE_MAP));
    for (const id of oldP) if (!newP.has(id)) calls.push(api.provinceRates.remove(id));
    for (const [id, fee] of Object.entries(data.PROVINCE_FEE_MAP)) calls.push(api.provinceRates.upsert(id, Number(fee)));
    // amphur_overrides
    const oldA = new Set(Object.keys(cur.AMPHUR_FEE_MAP));
    const newA = new Set(Object.keys(data.AMPHUR_FEE_MAP));
    for (const id of oldA) if (!newA.has(id)) calls.push(api.amphurOverrides.remove(id));
    for (const [id, fee] of Object.entries(data.AMPHUR_FEE_MAP)) calls.push(api.amphurOverrides.upsert(id, Number(fee)));
    // tumbon_overrides
    const oldT = new Set(Object.keys(cur.TUMBON_FEE_MAP));
    const newT = new Set(Object.keys(data.TUMBON_FEE_MAP));
    for (const id of oldT) if (!newT.has(id)) calls.push(api.tumbonOverrides.remove(id));
    for (const [id, fee] of Object.entries(data.TUMBON_FEE_MAP)) calls.push(api.tumbonOverrides.upsert(id, Number(fee)));
    // enabled + modifiers
    calls.push(api.enabledProvinces.set(data.enabledProvinces));
    calls.push(api.modifiers.set(data.modifierFees));
    await Promise.all(calls);
    await reloadConfig();
    renderAll();
    showStatus("Imported");
  } catch (e) {
    showStatus("Import error: " + e.message, true);
  }
}

async function resetToDefaults() {
  if (!confirm("Reset ทุกอย่างกลับเป็นค่า default — ข้อมูลที่เพิ่ม/แก้ไว้จะหายทั้งหมด ต้องการต่อหรือไม่?")) return;
  try {
    await api.seed({ force: true });
    await reloadConfig();
    renderAll();
    showStatus("Reset เรียบร้อย");
  } catch (e) { showStatus(e.message, true); }
}

// ─── Wire up ───
async function main() {
  setupTabs();
  await loadAll();
  renderAll();

  document.getElementById("add-amphur-table").onclick = () => openAmphurTableModal();
  document.getElementById("add-province-map").onclick = () => openProvinceMapModal();
  document.getElementById("add-amphur-map").onclick   = () => openAmphurMapModal();
  document.getElementById("add-tumbon-map").onclick   = () => openTumbonMapModal();

  document.getElementById("search-amphur-table").addEventListener("input", renderAmphurTable);

  document.getElementById("save-modifiers").onclick = async () => {
    const a = readNumberInput("mod-outOfArea");
    const h = readNumberInput("mod-outOfHours");
    if (a === null || h === null) { showStatus("กรอกตัวเลขให้ครบ", true); return; }
    try {
      await api.modifiers.set({ outOfArea: a, outOfHours: h });
      state.config.modifierFees = { outOfArea: a, outOfHours: h };
      showStatus("บันทึก modifier");
    } catch (e) { showStatus(e.message, true); }
  };

  document.getElementById("btn-export").onclick = exportJson;
  document.getElementById("btn-import").onclick = () => document.getElementById("import-file").click();
  document.getElementById("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("btn-reset").onclick = resetToDefaults;

  document.querySelector("main").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) handleAction(btn.dataset.action, btn.dataset.id);
  });

  document.querySelector(".modal-backdrop").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
  });
}

main().catch(e => {
  console.error(e);
  showStatus("Error: " + e.message, true);
});
