/**
 * admin.js (server) — CRUD สำหรับ rate config ผ่าน REST API
 * (port มาจาก extension admin.js เดิม — เปลี่ยน chrome.storage → fetch)
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
  dashboardConfig: null,   // { admins:[], aliases:{} } — badge/popup งานค้าง
  dashboard: null,         // snapshot งานค้าง (best-effort — ใช้ทำ datalist ชื่อ snapshot)
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
  // dashboard config (admins+aliases) + snapshot (best-effort: snapshot อาจ 404 ถ้า scraper ยังไม่อัป)
  try { state.dashboardConfig = await api.dashboardConfig.get(); }
  catch { state.dashboardConfig = { admins: [], aliases: {} }; }
  try { state.dashboard = await api.dashboard.get(); }
  catch { state.dashboard = null; }
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
      <td class="team-rates-cell">${summarizeTeamRatesCombined(row)}</td>
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

function renderTumbonOverride() {
  const tbody = document.querySelector("#table-tumbon-override tbody");
  const empty = document.getElementById("empty-tumbon-override");
  tbody.innerHTML = "";
  const map = state.config.TUMBON_FEE_OVERRIDE || {};
  const ids = Object.keys(map).sort();
  for (const id of ids) {
    const row = map[id];
    const aid = row.parentAmphur || "";
    const aname = state.ref.byAmphurId[aid] || aid;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${id}</td>
      <td>${row.label || "—"}</td>
      <td>${aid} ${aname}</td>
      <td class="center">${row.INS_INVEST_12 ?? "—"}</td>
      <td class="center">${row.INS_INVEST_34 ?? "—"}</td>
      <td class="center">${row.INS_TRANS ?? "—"}</td>
      <td class="center">${row.INS_PHOTO_12 ?? "—"}</td>
      <td class="team-rates-cell">${summarizeTeamRatesCombined(row)}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-tumbon-override" data-id="${id}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-tumbon-override" data-id="${id}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderSurveyorTeams() {
  const search = (document.getElementById("search-surveyor-teams")?.value || "").trim().toLowerCase();
  const tbody = document.querySelector("#table-surveyor-teams tbody");
  const empty = document.getElementById("empty-surveyor-teams");
  tbody.innerHTML = "";
  const map = state.config.SURVEYOR_TEAMS || {};
  const codes = Object.keys(map).sort();
  let count = 0;
  for (const code of codes) {
    const team = map[code];
    if (search && !`${code} ${team}`.toLowerCase().includes(search)) continue;
    count++;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${code}</td>
      <td>${team}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-surveyor-team" data-id="${code}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-surveyor-team" data-id="${code}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", count > 0);
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

// ─── Render: requiredFields ───
function tabOfFieldId(id) {
  const m = /^tab(\d+)/.exec(String(id || ""));
  return m ? `แท็บ ${m[1]}` : "—";
}

function renderRequiredFields() {
  const tbody = document.querySelector("#table-required-fields tbody");
  const empty = document.getElementById("empty-required-fields");
  tbody.innerHTML = "";
  const fields = state.config.requiredFields || [];
  fields.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${tabOfFieldId(f.id)}</td>
      <td><code>${f.id}</code></td>
      <td>${f.label || ""}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-required-field" data-id="${idx}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-required-field" data-id="${idx}">ลบ</button>
      </td>`;
    tbody.appendChild(tr);
  });
  empty.classList.toggle("hidden", fields.length > 0);
  const sb = document.getElementById("fld-save-buttons");
  if (sb) sb.value = (state.config.saveButtonIds || ["tab1_save"]).join(", ");
  const mt = document.getElementById("fld-required-mtypes");
  if (mt) mt.value = (state.config.requiredFieldsMtypes || ["1", "2"]).join(", ");
}

function renderAll() {
  renderAmphurTable();
  renderProvinceMap();
  renderAmphurMap();
  renderTumbonMap();
  renderTumbonOverride();
  renderSurveyorTeams();
  renderEnabled();
  renderModifiers();
  renderRequiredFields();
  renderDashboardConfig();
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

/** ── Team-rates editor (dynamic rows) ── */
function suggestTeamNames() {
  // unique teams จาก SURVEYOR_TEAMS เพื่อ pre-populate dropdown
  const set = new Set(Object.values(state.config?.SURVEYOR_TEAMS || {}));
  return Array.from(set).sort();
}

/**
 * Team rates editor — generic, supports หลาย field (SUR_INVEST_BY_TEAM, INS_TRANS_BY_TEAM)
 * key: ใช้แยก id ใน DOM (เช่น "sur" หรือ "trans")
 */
function teamRatesEditorHtml(byTeam, opts = {}) {
  const { key = "sur", title = "เรท SUR_INVEST แยกตามทีม (override SUR_INVEST flat)" } = opts;
  const entries = Object.entries(byTeam || {});
  const suggestions = suggestTeamNames();
  const datalistId = "team-name-suggestions";
  const dl = key === "sur"
    ? `<datalist id="${datalistId}">${suggestions.map(t => `<option value="${t}">`).join("")}</datalist>`
    : "";  // datalist รวม shared ระหว่างหลาย editor ใน modal เดียว — ประกาศครั้งเดียวพอ
  const rowsHtml = entries.length
    ? entries.map(([t, v]) => teamRowHtml(t, v, datalistId, key)).join("")
    : ""; // editor ของ INS_TRANS_BY_TEAM/optional — ไม่ pre-populate
  return `
    <div class="form-row">
      <label>${title}</label>
      <div id="team-rates-list-${key}" class="team-rates-list" data-key="${key}">${rowsHtml}</div>
      <button type="button" id="team-rates-add-${key}" class="btn btn-icon" style="margin-top:6px">+ เพิ่มทีม</button>
      ${dl}
    </div>
  `;
}

function teamRowHtml(team, rate, datalistId, key = "sur") {
  return `
    <div class="team-rate-row" data-key="${key}" style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
      <input type="text" class="team-name" placeholder="ชื่อทีม" value="${team || ""}" list="${datalistId}" style="flex:2"/>
      <input type="number" class="team-rate" placeholder="เรท" value="${rate ?? ""}" min="0" style="flex:1"/>
      <button type="button" class="btn btn-icon btn-danger team-remove">×</button>
    </div>
  `;
}

function setupTeamRatesEditor(keys = ["sur"]) {
  const datalistId = "team-name-suggestions";
  for (const key of keys) {
    const list = document.getElementById(`team-rates-list-${key}`);
    if (!list) continue;
    document.getElementById(`team-rates-add-${key}`)?.addEventListener("click", () => {
      list.insertAdjacentHTML("beforeend", teamRowHtml("", "", datalistId, key));
    });
    list.addEventListener("click", (e) => {
      if (e.target.classList?.contains("team-remove")) {
        e.target.closest(".team-rate-row")?.remove();
      }
    });
  }
}

/** อ่านค่าจาก team-rates-list-<key> — คืน { team: rate } หรือ null ถ้าว่างหมด/ไม่มี */
function readTeamRates(key = "sur") {
  const list = document.getElementById(`team-rates-list-${key}`);
  if (!list) return null;
  const obj = {};
  for (const row of list.querySelectorAll(".team-rate-row")) {
    const t = row.querySelector(".team-name")?.value.trim();
    const r = row.querySelector(".team-rate")?.value.trim();
    if (!t || r === "") continue;
    const n = Number(r);
    if (!isNaN(n)) obj[t] = n;
  }
  return Object.keys(obj).length === 0 ? null : obj;
}

/** สรุปสั้นๆ ของ team rates ใน table cell — เฉพาะ field เดียว */
function summarizeTeamRates(byTeam) {
  if (!byTeam) return "—";
  const entries = Object.entries(byTeam);
  if (entries.length === 0) return "—";
  return entries.map(([t, v]) => `${t}:${v}`).join(", ");
}

/** สรุปรวม SUR + TRANS by-team สำหรับ table cell */
function summarizeTeamRatesCombined(row) {
  const sur   = row?.SUR_INVEST_BY_TEAM;
  const trans = row?.INS_TRANS_BY_TEAM;
  if (!sur && !trans) return "—";
  const parts = [];
  if (sur)   parts.push(`SUR: ${summarizeTeamRates(sur)}`);
  if (trans) parts.push(`TRANS: ${summarizeTeamRates(trans)}`);
  return parts.join(" / ");
}

// ─── Add/Edit AMPHUR_FEE_TABLE ───
function openAmphurTableModal(id = null) {
  const isEdit = id !== null;
  const existing = isEdit ? state.config.AMPHUR_FEE_TABLE[id] : {};
  const provinceOptions = state.ref.provinces
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");
  // SUR_INVEST ใน multi-field มี 2 โหมด:
  //  (a) flat — เลขเดียวต่ออำเภอ (เก่า: ระยอง)
  //  (b) by-team — เรทแยกตามทีม surveyor (ใหม่: ชลบุรี)
  // Modal ให้ทั้ง 2 ช่อง — ถ้ากรอก by-team จะ override flat
  const tableFieldsHtml = TABLE_FIELDS.map(f => {
    const required = f.key === "SUR_INVEST" ? false : f.required; // SUR_INVEST optional ตอนใช้ by-team
    return `
      <div class="form-row">
        <label>${f.label}${required ? " *" : ""}</label>
        <input type="number" id="fld-${f.key}" min="0" value="${existing[f.key] ?? (isEdit ? "" : f.default)}" />
      </div>
    `;
  }).join("");

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
    <div class="form-grid">${tableFieldsHtml}</div>
    ${teamRatesEditorHtml(existing.SUR_INVEST_BY_TEAM, { key: "sur", title: "เรท SUR_INVEST แยกตามทีม (override SUR_INVEST flat ด้านบน)" })}
    ${teamRatesEditorHtml(existing.INS_TRANS_BY_TEAM,  { key: "trans", title: "เรท INS_TRANS (ค่าพาหนะ) แยกตามทีม (override INS_TRANS flat ด้านบน)" })}
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
      if (v !== null) obj[f.key] = v;
    }
    const surByTeam   = readTeamRates("sur");
    const transByTeam = readTeamRates("trans");
    if (surByTeam)   obj.SUR_INVEST_BY_TEAM = surByTeam;
    if (transByTeam) obj.INS_TRANS_BY_TEAM  = transByTeam;
    // ต้องมี SUR_INVEST flat หรือ SUR_INVEST_BY_TEAM อย่างน้อย 1
    if (obj.SUR_INVEST === undefined && !surByTeam) {
      document.getElementById("err-amphur").textContent = "ต้องกรอก SUR_INVEST flat หรือเรทตามทีม อย่างน้อย 1";
      return false;
    }
    await api.amphurTable.upsert(amphurID, obj);
    state.config.AMPHUR_FEE_TABLE[amphurID] = obj;
    renderAmphurTable();
    showStatus(`บันทึก ${amphurID} ${state.ref.byAmphurId[amphurID] || ""}`);
    return true;
  });
  setupTeamRatesEditor(["sur", "trans"]);

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

// ─── Add/Edit TUMBON_FEE_OVERRIDE (sub-area) ───
function openTumbonOverrideModal(id = null) {
  const isEdit = id !== null;
  const map = state.config.TUMBON_FEE_OVERRIDE || {};
  const existing = isEdit ? map[id] : {};
  const provinceOptions = state.ref.provinces
    .map(p => `<option value="${p.provinceID}" ${isEdit && id.startsWith(p.provinceID) ? "selected" : ""}>${p.provinceID} ${p.provincename}</option>`)
    .join("");

  const fieldsHtml = TABLE_FIELDS.filter(f => f.key !== "SUR_INVEST").map(f => `
    <div class="form-row">
      <label>${f.label}</label>
      <input type="number" id="fld-${f.key}" min="0" value="${existing[f.key] ?? ""}" />
    </div>
  `).join("");

  const body = `
    <div class="form-row">
      <label>จังหวัด *</label>
      <select id="sel-province" ${isEdit ? "disabled" : ""}>
        <option value="">-- เลือก --</option>${provinceOptions}
      </select>
    </div>
    <div class="form-row">
      <label>อำเภอแม่ (parent) *</label>
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
      <label>Label (ขึ้นบน checkbox sub-area) *</label>
      <input type="text" id="fld-label" value="${existing.label || ""}" placeholder="เช่น บ่อวิน" />
    </div>
    <div class="form-grid">${fieldsHtml}</div>
    ${teamRatesEditorHtml(existing.SUR_INVEST_BY_TEAM, { key: "sur", title: "เรท SUR_INVEST แยกตามทีม" })}
    ${teamRatesEditorHtml(existing.INS_TRANS_BY_TEAM,  { key: "trans", title: "เรท INS_TRANS (ค่าพาหนะ) แยกตามทีม" })}
  `;

  openModal(isEdit ? `แก้ ${id} ${existing.label || ""}` : "เพิ่มตำบลพิเศษ (Sub-area)", body, async () => {
    const tid = isEdit ? id : document.getElementById("sel-tumbon").value;
    const aid = isEdit ? existing.parentAmphur : document.getElementById("sel-amphur").value;
    const label = (document.getElementById("fld-label").value || "").trim();
    if (!tid || !aid) {
      document.getElementById("err-tumbon").textContent = "กรุณาเลือกตำบล + อำเภอ";
      return false;
    }
    if (!label) {
      document.getElementById("err-tumbon").textContent = "กรอก label";
      return false;
    }
    if (!isEdit && map[tid]) {
      document.getElementById("err-tumbon").textContent = "ตำบลนี้มีอยู่แล้ว";
      return false;
    }
    const fields = { label, parentAmphur: aid };
    for (const f of TABLE_FIELDS) {
      if (f.key === "SUR_INVEST") continue;
      const v = readNumberInput(`fld-${f.key}`);
      if (v !== null) fields[f.key] = v;
    }
    const surByTeam   = readTeamRates("sur");
    const transByTeam = readTeamRates("trans");
    if (surByTeam)   fields.SUR_INVEST_BY_TEAM = surByTeam;
    if (transByTeam) fields.INS_TRANS_BY_TEAM  = transByTeam;
    await api.tumbonFeeOverride.upsert(tid, fields);
    state.config.TUMBON_FEE_OVERRIDE = state.config.TUMBON_FEE_OVERRIDE || {};
    state.config.TUMBON_FEE_OVERRIDE[tid] = fields;
    renderTumbonOverride();
    showStatus(`บันทึก ${tid} ${label}`);
    return true;
  });

  setupTeamRatesEditor(["sur", "trans"]);

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
    // เมื่อเลือก tumbon ให้ auto-fill label จากชื่อตำบล (user แก้ได้)
    tumSel.addEventListener("change", () => {
      const tid = tumSel.value;
      const labelInput = document.getElementById("fld-label");
      if (tid && !labelInput.value) {
        const tname = state.ref.byTumbonId[tid] || "";
        labelInput.value = tname;
      }
    });
  }
}

// ─── Add/Edit SURVEYOR_TEAMS ───
function openSurveyorTeamModal(code = null) {
  const isEdit = code !== null;
  const map = state.config.SURVEYOR_TEAMS || {};
  const existingTeam = isEdit ? map[code] : "";
  const teamOptions = suggestTeamNames()
    .map(t => `<option value="${t}">`)
    .join("");
  const body = `
    <div class="form-row">
      <label>รหัสพนักงาน (SECxxx) *</label>
      <input type="text" id="fld-code" value="${code || ""}" ${isEdit ? "disabled" : ""} placeholder="SEC125" />
      <span class="error-msg" id="err-code"></span>
    </div>
    <div class="form-row">
      <label>ทีม *</label>
      <input type="text" id="fld-team" value="${existingTeam}" list="team-suggestions" placeholder="เช่น เมืองชลบุรี" />
      <datalist id="team-suggestions">${teamOptions}</datalist>
    </div>
  `;
  openModal(isEdit ? `แก้ ${code}` : "เพิ่มพนักงาน → ทีม", body, async () => {
    const c = isEdit ? code : (document.getElementById("fld-code").value || "").trim().toUpperCase();
    const t = (document.getElementById("fld-team").value || "").trim();
    if (!c || !t) { document.getElementById("err-code").textContent = "กรอกครบ"; return false; }
    if (!isEdit && map[c]) { document.getElementById("err-code").textContent = "รหัสนี้มีอยู่แล้ว"; return false; }
    await api.surveyorTeams.upsert(c, t);
    state.config.SURVEYOR_TEAMS = state.config.SURVEYOR_TEAMS || {};
    state.config.SURVEYOR_TEAMS[c] = t;
    renderSurveyorTeams();
    showStatus(`บันทึก ${c} → ${t}`);
    return true;
  });
}

// ─── Add/Edit requiredFields ───
async function saveRequiredFields() {
  await api.requiredFields.set({
    fields:        state.config.requiredFields || [],
    saveButtonIds: state.config.saveButtonIds  || ["tab1_save"],
    mtypes:        state.config.requiredFieldsMtypes || ["1", "2"],
  });
}

function openRequiredFieldModal(index = null) {
  const isEdit = index !== null;
  const fields = state.config.requiredFields || [];
  const existing = isEdit ? fields[index] : { id: "", label: "" };
  const body = `
    <div class="form-row">
      <label>Input ID (จากหน้า isurvey, ลงท้าย -inputEl) *</label>
      <input type="text" id="fld-req-id" value="${existing.id || ""}" placeholder="tab2_acc_date-inputEl" />
      <span class="error-msg" id="err-req"></span>
    </div>
    <div class="form-row">
      <label>ป้ายชื่อ (ข้อความที่แสดงตอนเตือน) *</label>
      <input type="text" id="fld-req-label" value="${existing.label || ""}" placeholder="วันที่เกิดเหตุ" />
    </div>
  `;
  openModal(isEdit ? `แก้ ${existing.label || existing.id}` : "เพิ่มฟิลด์บังคับ", body, async () => {
    const id    = (document.getElementById("fld-req-id").value || "").trim();
    const label = (document.getElementById("fld-req-label").value || "").trim();
    if (!id || !label) { document.getElementById("err-req").textContent = "กรอกให้ครบทั้ง 2 ช่อง"; return false; }
    if (fields.some((f, i) => f.id === id && i !== index)) {
      document.getElementById("err-req").textContent = "Input ID นี้มีอยู่แล้ว";
      return false;
    }
    const next = fields.slice();
    if (isEdit) next[index] = { id, label }; else next.push({ id, label });
    state.config.requiredFields = next;
    await saveRequiredFields();
    renderRequiredFields();
    showStatus(`บันทึก ${label}`);
    return true;
  });
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
    "edit-tumbon-override":   () => openTumbonOverrideModal(id),
    "delete-tumbon-override": async () => {
      const lbl = state.config.TUMBON_FEE_OVERRIDE?.[id]?.label || "";
      if (!confirm(`ลบตำบลพิเศษ ${id} ${lbl}?`)) return;
      await api.tumbonFeeOverride.remove(id);
      delete state.config.TUMBON_FEE_OVERRIDE[id];
      renderTumbonOverride();
      showStatus(`ลบ ${id}`);
    },
    "edit-surveyor-team":   () => openSurveyorTeamModal(id),
    "delete-surveyor-team": async () => {
      if (!confirm(`ลบ ${id} → ${state.config.SURVEYOR_TEAMS?.[id] || ""}?`)) return;
      await api.surveyorTeams.remove(id);
      delete state.config.SURVEYOR_TEAMS[id];
      renderSurveyorTeams();
      showStatus(`ลบ ${id}`);
    },
    "edit-required-field":   () => openRequiredFieldModal(Number(id)),
    "delete-required-field": async () => {
      const fields = state.config.requiredFields || [];
      const f = fields[Number(id)];
      if (!f) return;
      if (!confirm(`ลบฟิลด์บังคับ "${f.label || f.id}"?`)) return;
      state.config.requiredFields = fields.filter((_, i) => i !== Number(id));
      await saveRequiredFields();
      renderRequiredFields();
      showStatus(`ลบ ${f.label || f.id}`);
    },
    "delete-dash-admin": async () => {
      if (!confirm(`ลบ admin "${id}"?`)) return;
      const admins = (state.dashboardConfig?.admins || []).filter(a => a !== id);
      await api.dashboardConfig.set({ admins });
      state.dashboardConfig.admins = admins;
      renderDashboardConfig();
      showStatus(`ลบ admin: ${id}`);
    },
    "edit-dash-alias":   () => openDashAliasModal(id),
    "delete-dash-alias": async () => {
      if (!confirm(`ลบชื่อแทน "${id}"?`)) return;
      const next = { ...(state.dashboardConfig?.aliases || {}) };
      delete next[id];
      await api.dashboardConfig.set({ aliases: next });
      state.dashboardConfig.aliases = next;
      renderDashboardConfig();
      showStatus(`ลบชื่อแทน: ${id}`);
    },
  };
  if (map[action]) {
    try { await map[action](); }
    catch (e) { showStatus(e.message, true); }
  }
}

// ─── Dashboard config (admins + aliases) ───
function renderDashboardConfig() {
  const cfg = state.dashboardConfig || { admins: [], aliases: {} };

  // admins
  const at = document.querySelector("#table-dash-admins tbody");
  const ae = document.getElementById("empty-dash-admins");
  at.innerHTML = "";
  const admins = (cfg.admins || []).slice().sort((a, b) => String(a).localeCompare(String(b), "th"));
  for (const name of admins) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${name}</td>
      <td class="actions">
        <button class="btn btn-icon btn-danger" data-action="delete-dash-admin" data-id="${name}">ลบ</button>
      </td>`;
    at.appendChild(tr);
  }
  ae.classList.toggle("hidden", admins.length > 0);

  // aliases
  const lt = document.querySelector("#table-dash-aliases tbody");
  const le = document.getElementById("empty-dash-aliases");
  lt.innerHTML = "";
  const entries = Object.entries(cfg.aliases || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0]), "th"));
  for (const [login, snap] of entries) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${login}</td>
      <td>${snap}</td>
      <td class="actions">
        <button class="btn btn-icon" data-action="edit-dash-alias" data-id="${login}">แก้</button>
        <button class="btn btn-icon btn-danger" data-action="delete-dash-alias" data-id="${login}">ลบ</button>
      </td>`;
    lt.appendChild(tr);
  }
  le.classList.toggle("hidden", entries.length > 0);
}

function openDashAdminModal() {
  const body = `
    <div class="form-row">
      <label>ชื่อ admin (ตามที่ขึ้นในแถบ "Hi, …") *</label>
      <input type="text" id="fld-admin-name" placeholder="เช่น นพดล สมบูรณ์กุล" />
      <span class="error-msg" id="err-admin"></span>
    </div>`;
  openModal("เพิ่ม admin", body, async () => {
    const name = (document.getElementById("fld-admin-name").value || "").trim();
    if (!name) { document.getElementById("err-admin").textContent = "กรอกชื่อ"; return false; }
    const admins = (state.dashboardConfig?.admins || []).slice();
    if (admins.includes(name)) { document.getElementById("err-admin").textContent = "มีชื่อนี้แล้ว"; return false; }
    admins.push(name);
    await api.dashboardConfig.set({ admins });
    state.dashboardConfig = state.dashboardConfig || {};
    state.dashboardConfig.admins = admins;
    renderDashboardConfig();
    showStatus(`เพิ่ม admin: ${name}`);
    return true;
  });
}

function openDashAliasModal(loginKey = null) {
  const isEdit = loginKey !== null;
  const aliases = state.dashboardConfig?.aliases || {};
  const curSnap = isEdit ? (aliases[loginKey] || "") : "";
  // datalist = รายชื่อจริงใน snapshot → เลือกให้ตรงตัวสะกด ไม่ต้องพิมพ์เอง
  const snapNames = ((state.dashboard && state.dashboard.supervisors) || []).map(s => s.name);
  const dl = snapNames.map(n => `<option value="${n}">`).join("");
  const body = `
    <div class="form-row">
      <label>ชื่อตอน login (header isurvey) *</label>
      <input type="text" id="fld-alias-login" value="${loginKey || ""}" ${isEdit ? "disabled" : ""} placeholder="เช่น ธนัช หรินทรสุทธิ" />
      <span class="error-msg" id="err-alias"></span>
    </div>
    <div class="form-row">
      <label>→ ชื่อในข้อมูล snapshot (เลือกจากรายชื่อจริง) *</label>
      <input type="text" id="fld-alias-snap" value="${curSnap}" list="snap-suggestions" placeholder="เช่น นาย สันติ หรินทรสุทธิ" />
      <datalist id="snap-suggestions">${dl}</datalist>
    </div>`;
  openModal(isEdit ? `แก้ชื่อแทน ${loginKey}` : "เพิ่มชื่อแทน", body, async () => {
    const login = isEdit ? loginKey : (document.getElementById("fld-alias-login").value || "").trim();
    const snap = (document.getElementById("fld-alias-snap").value || "").trim();
    if (!login || !snap) { document.getElementById("err-alias").textContent = "กรอกครบ"; return false; }
    const next = { ...(state.dashboardConfig?.aliases || {}) };
    next[login] = snap;
    await api.dashboardConfig.set({ aliases: next });
    state.dashboardConfig = state.dashboardConfig || {};
    state.dashboardConfig.aliases = next;
    renderDashboardConfig();
    showStatus(`บันทึกชื่อแทน: ${login} → ${snap}`);
    return true;
  });
}

// ─── Import/Export/Reset ───
function exportJson() {
  const c = state.config;
  const payload = {
    PROVINCE_FEE_MAP:    c.PROVINCE_FEE_MAP,
    AMPHUR_FEE_MAP:      c.AMPHUR_FEE_MAP,
    TUMBON_FEE_MAP:      c.TUMBON_FEE_MAP,
    AMPHUR_FEE_TABLE:    c.AMPHUR_FEE_TABLE,
    TUMBON_FEE_OVERRIDE: c.TUMBON_FEE_OVERRIDE || {},
    SURVEYOR_TEAMS:      c.SURVEYOR_TEAMS      || {},
    enabledProvinces:    c.enabledProvinces,
    modifierFees:        c.modifierFees,
    requiredFields:      c.requiredFields      || [],
    saveButtonIds:       c.saveButtonIds       || ["tab1_save"],
    requiredFieldsMtypes: c.requiredFieldsMtypes || ["1", "2"],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  a.href = url;
  a.download = `se-billing-data-${stamp}.json`;
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
    // tumbon_fee_override (sub-area)
    const oldTo = new Set(Object.keys(cur.TUMBON_FEE_OVERRIDE || {}));
    const newTo = new Set(Object.keys(data.TUMBON_FEE_OVERRIDE || {}));
    for (const id of oldTo) if (!newTo.has(id)) calls.push(api.tumbonFeeOverride.remove(id));
    for (const [id, row] of Object.entries(data.TUMBON_FEE_OVERRIDE || {})) calls.push(api.tumbonFeeOverride.upsert(id, row));
    // surveyor_teams
    const oldS = new Set(Object.keys(cur.SURVEYOR_TEAMS || {}));
    const newS = new Set(Object.keys(data.SURVEYOR_TEAMS || {}));
    for (const code of oldS) if (!newS.has(code)) calls.push(api.surveyorTeams.remove(code));
    for (const [code, team] of Object.entries(data.SURVEYOR_TEAMS || {})) calls.push(api.surveyorTeams.upsert(code, team));
    // enabled + modifiers
    calls.push(api.enabledProvinces.set(data.enabledProvinces));
    calls.push(api.modifiers.set(data.modifierFees));
    // requiredFields/saveButtonIds/mtypes: optional (ไฟล์ export เก่าไม่มี key นี้ — ข้ามได้)
    if (Array.isArray(data.requiredFields) || Array.isArray(data.saveButtonIds) || Array.isArray(data.requiredFieldsMtypes)) {
      calls.push(api.requiredFields.set({
        fields: data.requiredFields, saveButtonIds: data.saveButtonIds, mtypes: data.requiredFieldsMtypes,
      }));
    }
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

  document.getElementById("add-amphur-table").onclick     = () => openAmphurTableModal();
  document.getElementById("add-province-map").onclick     = () => openProvinceMapModal();
  document.getElementById("add-amphur-map").onclick       = () => openAmphurMapModal();
  document.getElementById("add-tumbon-map").onclick       = () => openTumbonMapModal();
  document.getElementById("add-tumbon-override").onclick  = () => openTumbonOverrideModal();
  document.getElementById("add-surveyor-team").onclick    = () => openSurveyorTeamModal();
  document.getElementById("add-required-field").onclick   = () => openRequiredFieldModal();
  document.getElementById("add-dash-admin").onclick       = () => openDashAdminModal();
  document.getElementById("add-dash-alias").onclick       = () => openDashAliasModal();

  document.getElementById("save-save-buttons").onclick = async () => {
    const raw = document.getElementById("fld-save-buttons").value || "";
    const ids = raw.split(",").map(s => s.trim()).filter(Boolean);
    state.config.saveButtonIds = ids.length ? ids : ["tab1_save"];
    try {
      await saveRequiredFields();
      renderRequiredFields();
      showStatus("บันทึกรายการปุ่มบันทึก");
    } catch (e) { showStatus(e.message, true); }
  };

  document.getElementById("save-required-mtypes").onclick = async () => {
    const raw = document.getElementById("fld-required-mtypes").value || "";
    const ms = raw.split(",").map(s => s.trim()).filter(Boolean);
    state.config.requiredFieldsMtypes = ms; // ว่าง = ตรวจทุก MtypeID
    try {
      await saveRequiredFields();
      renderRequiredFields();
      showStatus("บันทึก MtypeID ที่ต้องตรวจ");
    } catch (e) { showStatus(e.message, true); }
  };

  document.getElementById("search-amphur-table").addEventListener("input", renderAmphurTable);
  document.getElementById("search-surveyor-teams")?.addEventListener("input", renderSurveyorTeams);

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
