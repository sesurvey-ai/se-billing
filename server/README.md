# I Survey Helper — Backend Server

Backend สำหรับ I Survey Auto-Fill Helper Chrome Extension — เก็บ rate config ใน SQLite, มีหน้าเว็บ admin/viewer/captures, รับข้อมูลที่ extension จับจากฟอร์ม `cloud.isurvey.mobi`

## Stack

- Node.js 22+ (ใช้ `node:sqlite` built-in — ไม่ต้องคอมไพล์ native dep)
- Express (HTTP framework)
- ไฟล์ DB เดียว `data/isurvey-helper.db` — backup ง่าย, ย้ายเครื่องด้วย copy file

## ติดตั้ง + รัน

```bash
cd server
npm install
node server.js
```

หน้าเว็บ (port 3200):
- <http://localhost:3200/>               — **เรทราคา** (Viewer, อ่านอย่างเดียว) + ลิงก์ไป รายละเอียด
- <http://localhost:3200/admin>          — **เรทราคา** (Admin: เพิ่ม/แก้/ลบ + Import/Export/Reset)
- <http://localhost:3200/captures>       — **รายละเอียด** (public, ไม่มีปุ่มลบ) + Export Excel
- <http://localhost:3200/admin/captures> — **รายละเอียด** (admin: มีลบรายตัว/Clear all) + Export Excel

ฝั่ง public (เรทราคา + รายละเอียด) ไม่มีลิงก์เข้า admin — admin เข้าได้โดยพิมพ์ URL เท่านั้น

## Environment variables

| ENV   | Default     | หน้าที่ |
|-------|-------------|--------|
| PORT  | `3200`      | Port ที่ฟัง |
| HOST  | `0.0.0.0`   | bind interface (`0.0.0.0` เพื่อรับจาก LAN; `127.0.0.1` เฉพาะ localhost) |

## REST API

| Method | Path | Body | คืน |
|--------|------|------|-----|
| GET    | `/healthz` | — | `{ ok, ts }` |
| GET    | `/api/config` | — | ทั้ง config (PROVINCE_FEE_MAP / AMPHUR_FEE_MAP / TUMBON_FEE_MAP / AMPHUR_FEE_TABLE / enabledProvinces / modifierFees) |
| GET    | `/api/reference` | — | provinces / amphurs / tumbons (lists + maps) |
| POST   | `/api/seed?force=1` | — | ล้าง DB + seed จาก `seed/default-data.json` |
| GET / PUT (`:id`) / DELETE (`:id`) | `/api/province-rates` | `{ sur_invest }` | CRUD |
| GET / PUT (`:id`) / DELETE (`:id`) | `/api/amphur-overrides` | `{ sur_invest }` | CRUD |
| GET / PUT (`:id`) / DELETE (`:id`) | `/api/tumbon-overrides` | `{ sur_invest }` | CRUD |
| GET / PUT (`:id`) / DELETE (`:id`) | `/api/amphur-table` | `{ SUR_INVEST, INS_INVEST_12, INS_INVEST_34, INS_TRANS, INS_PHOTO_12 }` | CRUD multi-field |
| GET / PUT | `/api/enabled-provinces` | `{ ids: [...] }` | string[] |
| GET / PUT | `/api/modifiers` | `{ outOfArea, outOfHours }` | object |
| POST / GET / DELETE / DELETE (`:id`) | `/api/captures` | rec | เก็บ/อ่าน/ลบ capture log |
| GET    | `/api/captures.xlsx?provinceId=…` | — | ดาวน์โหลด Excel ของ captures (ExcelJS) |

### Capture validation
- ถ้า `deduct_amt > 0` ต้องมี `late_submit: true` หรือ `incomplete_docs: true`
  อย่างน้อย 1 ใน 2 — ไม่งั้น POST จะถูก reject ด้วย 400
- Schema: `inspector_name`, `late_submit`, `incomplete_docs` ถูก auto-migrate ผ่าน
  `ensureColumn(...)` ใน [`db.js`](./db.js) สำหรับ DB ที่มีอยู่แล้ว

## Schema (SQLite)

ดูที่ [`db.js`](./db.js) — ตาราง `province_rates` / `amphur_overrides` / `tumbon_overrides` / `amphur_table` / `enabled_provinces` / `settings` / `captures` — สเกลเล็ก ใช้ index เฉพาะ `captures.ts`/`captures.province_id`

## ย้ายไปเครื่องอื่นใน LAN

1. Copy ทั้งโฟลเดอร์ `server/` ไปเครื่องใหม่ — ทุกอย่าง self-contained (รวม `seed/` + `node_modules/` ถ้าต้องการ skip `npm install`)
2. ติดตั้ง Node.js 22+ บนเครื่องใหม่
3. รัน `node server.js` (default ฟัง 0.0.0.0:3200 — รับจาก LAN ได้)
4. หา IP เครื่อง server เช่น `ipconfig` (Windows) → ได้ `192.168.1.50`
5. ที่เครื่อง client (Chrome ที่ลง extension):
   - เปิด `chrome://extensions` → คลิก "Details" ของ "I Survey Auto-Fill Helper" → "Extension options"
   - กรอก Server URL = `http://192.168.1.50:3200` → "บันทึก" → "ทดสอบเชื่อมต่อ"
6. รีเฟรชหน้า `cloud.isurvey.mobi` — extension จะเริ่มอ่านเรตจาก server ใหม่และส่ง captures ไปเก็บ

> **Firewall:** ถ้า client เชื่อมต่อ LAN ไม่ได้ ตรวจ Windows Firewall บนเครื่อง server ว่าอนุญาตให้พอร์ต 3200 inbound. ถ้าจำเป็น ใช้คำสั่ง:
>
> ```powershell
> New-NetFirewallRule -DisplayName "isurvey-helper-server" -Direction Inbound -Protocol TCP -LocalPort 3200 -Action Allow
> ```

## Backup / Restore

- **Backup file-based:** copy `data/isurvey-helper.db` ขณะ server หยุด (SQLite WAL ใช้ `data/isurvey-helper.db-wal` คู่ — copy ทั้งสอง)
- **Backup JSON:** หน้า /admin → "Export JSON" — ได้ไฟล์เดียวกับ seed format
- **Restore JSON:** /admin → "Import JSON" หรือ POST `/api/seed?force=1` (อ่าน `seed/default-data.json`)

## โครงสร้าง

```
server/
├── package.json
├── server.js                  ← Express routes + static
├── db.js                      ← SQLite schema + queries (node:sqlite built-in)
├── data/
│   └── isurvey-helper.db      ← SQLite DB (สร้างอัตโนมัติ)
├── seed/                      ← seed data (server self-contained)
│   ├── default-data.json
│   ├── provinces.json
│   ├── amphurs.json
│   └── tumbons.json
└── public/
    ├── index.html / viewer.js  ← read-only
    ├── admin.html / admin.js   ← CRUD
    ├── captures.html / captures.js
    ├── api.js                  ← REST client (shared)
    └── style.css
```
