// viewer.js — read-only display of all rate config
"use strict";

const state = { config: null, ref: null };

const provinceIdFromAmphurId = (id) => String(id).substring(0, 2);
const amphurIdFromTumbonId   = (id) => String(id).substring(0, 4);

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== target));
    });
  });
}

function renderSummary() {
  const c = state.config;
  const items = [
    { label: "Multi-field amphurs", value: Object.keys(c.AMPHUR_FEE_TABLE).length },
    { label: "Simple จังหวัด",       value: Object.keys(c.PROVINCE_FEE_MAP).length },
    { label: "Simple amphur override", value: Object.keys(c.AMPHUR_FEE_MAP).length },
    { label: "Simple tumbon override", value: Object.keys(c.TUMBON_FEE_MAP).length },
    { label: "Enabled provinces",    value: c.enabledProvinces.length },
  ];
  document.getElementById("summary").innerHTML = items.map(i =>
    `<div class="summary-card"><div class="label">${i.label}</div><div class="value">${i.value}</div></div>`
  ).join("");
}

function renderAmphurTable() {
  const search = (document.getElementById("search-amphur-table").value || "").trim().toLowerCase();
  const tbody = document.getElementById("tbody-amphur-table");
  const empty = document.getElementById("empty-amphur-table");
  const ref = state.ref;
  tbody.innerHTML = "";
  let count = 0;
  const ids = Object.keys(state.config.AMPHUR_FEE_TABLE).sort();
  for (const id of ids) {
    const name = ref.byAmphurId[id] || "";
    const pid = provinceIdFromAmphurId(id);
    const pname = ref.byProvinceId[pid] || pid;
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
      <td>${name || "(ไม่พบ)"}</td>
      <td class="center">${row.SUR_INVEST ?? "—"}</td>
      <td class="center">${row.INS_INVEST_12 ?? "—"}</td>
      <td class="center">${row.INS_INVEST_34 ?? "—"}</td>
      <td class="center">${row.INS_TRANS ?? "—"}</td>
      <td class="center">${row.INS_PHOTO_12 ?? "—"}</td>`;
    tbody.appendChild(tr);
  }
  document.getElementById("count-amphur-table").textContent = `${count} / ${ids.length} รายการ`;
  empty.classList.toggle("hidden", count > 0);
}

function renderProvinceMap() {
  const tbody = document.getElementById("tbody-province-map");
  const empty = document.getElementById("empty-province-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.PROVINCE_FEE_MAP).sort();
  for (const id of ids) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${id}</td><td>${state.ref.byProvinceId[id] || "(ไม่พบ)"}</td><td class="numeric">${state.config.PROVINCE_FEE_MAP[id]}</td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderAmphurMap() {
  const tbody = document.getElementById("tbody-amphur-map");
  const empty = document.getElementById("empty-amphur-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.AMPHUR_FEE_MAP).sort();
  for (const id of ids) {
    const pid = provinceIdFromAmphurId(id);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${id}</td><td>${state.ref.byProvinceId[pid] || pid}</td><td>${state.ref.byAmphurId[id] || "(ไม่พบ)"}</td><td class="numeric">${state.config.AMPHUR_FEE_MAP[id]}</td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderTumbonMap() {
  const tbody = document.getElementById("tbody-tumbon-map");
  const empty = document.getElementById("empty-tumbon-map");
  tbody.innerHTML = "";
  const ids = Object.keys(state.config.TUMBON_FEE_MAP).sort();
  for (const id of ids) {
    const aid = amphurIdFromTumbonId(id);
    const pid = provinceIdFromAmphurId(aid);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${id}</td><td>${state.ref.byProvinceId[pid] || pid}</td><td>${state.ref.byAmphurId[aid] || aid}</td><td>${state.ref.byTumbonId[id] || "(ไม่พบ)"}</td><td class="numeric">${state.config.TUMBON_FEE_MAP[id]}</td>`;
    tbody.appendChild(tr);
  }
  empty.classList.toggle("hidden", ids.length > 0);
}

function renderEnabled() {
  const set = new Set(state.config.enabledProvinces);
  const html = state.ref.provinces.map(p =>
    `<label><input type="checkbox" disabled ${set.has(p.provinceID) ? "checked" : ""}/> ${p.provinceID} ${p.provincename}</label>`
  ).join("");
  document.getElementById("enabled-list").innerHTML = html;
}

function renderModifiers() {
  const m = state.config.modifierFees;
  document.getElementById("modifiers-view").innerHTML = `
    <p>นอกพื้นที่ (outOfArea): <strong>+${m.outOfArea ?? 0}</strong> บาท</p>
    <p>นอกเวลา (outOfHours): <strong>+${m.outOfHours ?? 0}</strong> บาท</p>
  `;
}

async function main() {
  setupTabs();
  [state.config, state.ref] = await Promise.all([api.config(), api.reference()]);
  renderSummary();
  renderAmphurTable();
  renderProvinceMap();
  renderAmphurMap();
  renderTumbonMap();
  renderEnabled();
  renderModifiers();
  document.getElementById("search-amphur-table").addEventListener("input", renderAmphurTable);
}

main().catch(e => {
  console.error(e);
  document.body.insertAdjacentHTML("beforeend", `<pre style="color:red;padding:20px">โหลดข้อมูลล้มเหลว: ${e.message}</pre>`);
});
