# -*- coding: utf-8 -*-
"""Unit tests for the pure logic in pull_data.py (no network / no credentials).
Run:  python test_logic.py
Uses the REAL mapping_supervisor_staff_.json + realistic sample rows."""
import sqlite3
import sys
from datetime import date, datetime, timedelta
import pull_data as P

# ให้ print ภาษาไทย/emoji ไม่ crash บน Windows console (cp874) — เขียน UTF-8 เสมอ
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

FAILS = []
def check(name, cond):
    print(("  OK   " if cond else " FAIL  ") + name)
    if not cond:
        FAILS.append(name)

# ---- name normalization ----
check("norm: strip 'Hi,'+title+spaces",
      P.norm_name("Hi, นาย ศุภชัย เศรษฐชัยชาญ") == "ศุภชัยเศรษฐชัยชาญ")
check("norm: 'นายวรภพ หัตถิยา' == 'นาย วรภพ หัตถิยา'",
      P.norm_name("นายวรภพ หัตถิยา") == P.norm_name("นาย วรภพ หัตถิยา"))
check("norm: closer w/o นาย matches mapping key",
      P.norm_name("นันทภัค กุมมาน้อย") == P.norm_name("นาย นันทภัค กุมมาน้อย"))

# ---- employee code extraction ----
check("code: 'SE445 ...' -> SE445", P.emp_code("SE445 นายวีระพงษ์ แก้วเขียว") == "SE445")
check("code: 'SE170นาย...' (no space) -> SE170", P.emp_code("SE170นายสหสัณฑ์ เหมยากร") == "SE170")
check("code: 'SEC125 ...' -> SEC125", P.emp_code("SEC125 นาย สมภพ ปั้นเปรื่อง") == "SEC125")
check("code: company -> None", P.emp_code("หจก ศรีราชาเคลม เซอร์วิส") is None)

# ---- date parsing ----
check("thai date 2569->2026", P.parse_thai_dt("19/มิ.ย./2569 16:24") == date(2026, 6, 19))
check("thai date 2561->2018", P.parse_thai_dt("23/ส.ค./2561 17:25") == date(2018, 8, 23))
check("isurvey datetime", P.parse_isurvey_dt("2026-06-18 16:17") == datetime(2026, 6, 18, 16, 17))

# ---- mapping resolution (real file) ----
mapping = P.load_mapping()
code_to_sup, company_to_sups, norm_sup_to_display, supervisors = mapping
check("map: 10 supervisors incl. สราวุธ", len(supervisors) == 10 and "นายสราวุธ บุญคุ้ม" in supervisors)
check("map: ศุภชัย is a key", "นาย ศุภชัย เศรษฐชัยชาญ" in supervisors)
check("map: SEC125 -> ศุภชัย", code_to_sup.get("SEC125") == "นาย ศุภชัย เศรษฐชัยชาญ")
check("map: SE297 -> ภูริ ภัทรภิรัก", code_to_sup.get("SE297") == "นายภูริ ภัทรภิรัก")
check("surveyor SE297 -> {ภูริ ภัทรภิรัก}",
      P.surveyor_supervisors("SE297 นายวิษณุ แดงจวง", code_to_sup, company_to_sups) == {"นายภูริ ภัทรภิรัก"})
shared = P.surveyor_supervisors("หจก ศรีราชาเคลม เซอร์วิส", code_to_sup, company_to_sups)
check("shared outsource under >=2 supervisors", len(shared) >= 2)
check("closer 'นายภูริ ภัทรภิรัก' -> key", P.closer_supervisor("นายภูริ ภัทรภิรัก", norm_sup_to_display) == "นายภูริ ภัทรภิรัก")
check("closer 'นายวรภพ หัตถิยา' (spacing) -> 'นาย วรภพ หัตถิยา'",
      P.closer_supervisor("นายวรภพ หัตถิยา", norm_sup_to_display) == "นาย วรภพ หัตถิยา")
check("closer 'ธนัช หรินทรสุทธิ' -> 'นาย ธนัช หรินทรสุทธิ' (สันติ เปลี่ยนชื่อเป็น ธนัช)",
      P.closer_supervisor("ธนัช หรินทรสุทธิ", norm_sup_to_display) == "นาย ธนัช หรินทรสุทธิ")

# ---- end-to-end aggregate_daily (in-memory index) ----
con = sqlite3.connect(":memory:")
con.execute("""CREATE TABLE claim_closer(claim_no TEXT PRIMARY KEY, closer TEXT, surveyor TEXT,
               status TEXT, dispatch_dt TEXT, checker_dt TEXT, updated TEXT)""")
con.executemany("INSERT INTO claim_closer(claim_no,closer) VALUES(?,?)",
                [("C1", "นาย ศุภชัย เศรษฐชัยชาญ"), ("C2", "นายภูริ ภัทรภิรัก"),
                 ("C9", "นาย เจษ ผินกลับ")])   # ผู้ปิดงานที่ไม่อยู่ใน mapping
con.commit()

today = date.today()
disp = (today - timedelta(days=3)).strftime("%Y-%m-%d 09:00")
isurvey_rows = [
    {"claim_no": "B1", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B2", "empcode": "SE297 นายวิษณุ แดงจวง", "stt_desc": "เสร็จงาน",       "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B3", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "จบงาน",          "dispatch_dt": disp, "checkByName": "นาย ศุภชัย เศรษฐชัยชาญ", "checker_dt": disp},
    {"claim_no": "B4", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "ยกเลิกเคลม",      "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B5", "empcode": "หจก ศรีราชาเคลม เซอร์วิส",    "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"survey_no": "SEABI-000006", "empcode": "SE999 ไม่รู้จัก",  "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},   # ไม่มี claim_no -> fallback survey_no
    {"claim_no": "B7", "survey_no": "SETP-6907-000123", "empcode": "SE297 นายวิษณุ แดงจวง", "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B8", "survey_no": "SEMS6907000124",   "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
]
INV = {v: k for k, v in P.THAI_MONTHS.items()}
def thai(d):
    return f"{d.day:02d}/{INV[d.month]}/{d.year + 543} 00:00"
recent = today - timedelta(days=20)
oldd = today - timedelta(days=900)  # > 2 years
emcs_lists = {
    "continuous": [(thai(recent), "C1"), (thai(oldd), "C2"), (thai(recent), "C2"),
                   (thai(recent), "UNKNOWN"), (thai(recent), "C9")],
    "edit": [(thai(recent), "C1")],
}
PREFIX_OWNERS = {"SETP": "นายสราวุธ บุญคุ้ม", "SEMS": "นายสราวุธ บุญคุ้ม"}
out = P.aggregate_daily(con, isurvey_rows, emcs_lists, mapping, 2, PREFIX_OWNERS)
sup = {s["name"]: s for s in out["supervisors"]}
S = sup["นาย ศุภชัย เศรษฐชัยชาญ"]
B = sup["นายภูริ ภัทรภิรัก"]
SN = sup["นาย ธนัช หรินทรสุทธิ"]   # เดิม "นาย สันติ หรินทรสุทธิ" — เปลี่ยนชื่อเป็น ธนัช (rename)
SAR = sup["นายสราวุธ บุญคุ้ม"]

check("agg: ศุภชัย backlog = 2 (B1 + shared B5)", S["isurvey_backlog"] == 2)
check("agg: ธนัช (เดิม สันติ) backlog = 1 (shared B5)", SN["isurvey_backlog"] == 1)
check("agg: ภูริ ภัทรภิรัก backlog = 1 (B2, SE297)", B["isurvey_backlog"] == 1)
check("agg: จบงาน & ยกเลิก excluded from backlog", "จบงาน" not in S["isurvey_by_status"] and "ยกเลิกเคลม" not in S["isurvey_by_status"])
check("agg: B6 (ผู้สำรวจนอก mapping) -> bucket 'sesurvey'", sup["sesurvey"]["isurvey_backlog"] == 1)
check("agg: claim_no ว่าง -> item.claim_no fallback เป็น survey_no", sup["sesurvey"]["isurvey_items"][0]["claim_no"] == "SEABI-000006")
check("agg: ไม่มี isurvey unmatched แล้ว (ไป sesurvey หมด)", out["unmatched"]["isurvey_backlog"] == 0)
check("agg: ศุภชัย emcs continuous=1, edit=1 (C1)", S["emcs_continuous"] == 1 and S["emcs_edit"] == 1)
check("agg: ภูริ ภัทรภิรัก emcs continuous=1 (C2 recent; old filtered)", B["emcs_continuous"] == 1)
check("agg: เจษ (ผู้ปิดงานนอก mapping) emcs continuous=1 -> bucket ตามชื่อจริง", sup["นาย เจษ ผินกลับ"]["emcs_continuous"] == 1)
check("agg: UNKNOWN (หา closer ไม่ได้) -> sesurvey emcs continuous=1", sup["sesurvey"]["emcs_continuous"] == 1)
check("agg: ไม่มี emcs unmatched แล้ว", out["unmatched"]["emcs"] == 0)
check("agg: aging_days computed (int)", isinstance(S["isurvey_items"][0]["aging_days"], int))

# ---- survey_no prefix rule (SETP/SEMS -> นายสราวุธ, exclusive: ชนะการ map ตามผู้สำรวจ) ----
check("agg: สราวุธ backlog = 2 (SETP B7 + SEMS B8 by survey_no)", SAR["isurvey_backlog"] == 2)
check("agg: SETP job NOT double-counted to surveyor's sup (ภูริ ภัทรภิรัก stays 1)", B["isurvey_backlog"] == 1)
check("agg: SEMS job NOT double-counted to surveyor's sup (ศุภชัย stays 2)", S["isurvey_backlog"] == 2)
check("agg: survey_no kept on isurvey item", any((it.get("survey_no") or "").startswith("SETP") for it in SAR["isurvey_items"]))

# ---- แถว EMCS แบบ dict (ตัวดึงรุ่น 25/09/69) — ชุดเดิมของ extension ต้องได้ผลเท่าแบบ tuple ----
def as_dict(t, **extra):
    return {"date": t[0], "claim_no": t[1], **extra}
check("row fields: dict + tuple", P.emcs_row_fields({"date": "d", "claim_no": "c"}) == ("d", "c")
      and P.emcs_row_fields(("d", "c")) == ("d", "c"))
emcs_dicts = {k: [as_dict(t) for t in v] for k, v in emcs_lists.items()}
out2 = P.aggregate_daily(con, isurvey_rows, emcs_dicts, mapping, 2, PREFIX_OWNERS)
check("agg: dict rows = tuple rows (extension ไม่เปลี่ยน)",
      out2["totals"] == out["totals"]
      and {s["name"]: (s["emcs_edit"], s["emcs_continuous"]) for s in out2["supervisors"]}
      == {s["name"]: (s["emcs_edit"], s["emcs_continuous"]) for s in out["supervisors"]})

# ---- emcs_inbox: รายการเต็มให้เว็บ se-survey ----
inbox_lists = {
    "continuous": [
        as_dict((thai(recent), "C1"), esurvey_no="S68426093061", survey_no="SEABI-121260900065", company="ไอโออิกรุงเทพประกันภัย",
                follow_type="-", lock_by="สุทิษา พงษ์แขก", lock_icon="Lock_Blue.gif", keyer="สุทิษา พงษ์แขก", car_role="ประกัน"),
        as_dict((thai(oldd), "C2"), follow_type="งานติดตาม - รถหาย"),                 # เกิน 2 ปี: ชุด extension ตัด แต่ inbox ต้องมี
        as_dict((thai(recent), ""), survey_no="SETP-6907-000125"),                  # ไม่มีเลขเคลม + SETP -> สราวุธ (prefix)
        as_dict((thai(recent), ""), survey_no="SEABI-000999"),                      # ไม่มีเลขเคลม ไม่มี prefix -> sesurvey
        as_dict((thai(recent), "C9")),                                              # ผู้ปิดงานนอก mapping -> ชื่อจริง
    ],
    "edit": [as_dict((thai(recent), "C1"))],
}
inbox = P.build_emcs_inbox(con, inbox_lists, mapping, 2, PREFIX_OWNERS)
C = inbox["continuous"]
check("inbox: ครบทุกแถว (เกิน 2 ปี + ไม่มีเลขเคลมไม่ถูกตัด)", inbox["totals"] == {"edit": 1, "continuous": 5} and len(C) == 5)
check("inbox: ok=True เมื่อมีรายการจาก EMCS · max_age_years ติดไปด้วย", inbox["ok"] is True and inbox["max_age_years"] == 2)
check("inbox: เกิน 2 ปี ติดธง over_age · ปกติไม่ติด", C[1]["over_age"] is True and C[0]["over_age"] is False)
check("inbox: หัวหน้าจากผู้ปิดงาน (C1 -> ศุภชัย · C2 -> ภูริ)",
      C[0]["supervisor"] == "นาย ศุภชัย เศรษฐชัยชาญ" and C[0]["supervisor_from"] == "closer"
      and C[1]["supervisor"] == "นายภูริ ภัทรภิรัก")
check("inbox: ไม่มีเลขเคลม + SETP -> สราวุธ (prefix) · ไม่มี prefix -> sesurvey",
      C[2]["supervisor"] == "นายสราวุธ บุญคุ้ม" and C[2]["supervisor_from"] == "prefix"
      and C[3]["supervisor"] == "sesurvey" and C[3]["supervisor_from"] == "none")
check("inbox: ผู้ปิดงานนอก mapping -> ชื่อจริง", C[4]["supervisor"] == "นาย เจษ ผินกลับ")
check("inbox: คอลัมน์ครบ · ประเภทงานติดตาม '-' = ว่าง",
      C[0]["esurvey_no"] == "S68426093061" and C[0]["survey_no"] == "SEABI-121260900065" and C[0]["lock_by"] == "สุทิษา พงษ์แขก"
      and C[0]["follow_type"] == "" and C[1]["follow_type"] == "งานติดตาม - รถหาย" and isinstance(C[0]["aging_days"], int))
check("inbox: ไม่มีกรมธรรม์/ทะเบียน/ยี่ห้อ/รุ่น ขึ้น VPS", not any(k in C[0] for k in ("policy_no", "plate", "brand", "model")))
check("inbox: เข้า EMCS ไม่ได้ (ไม่มีรายการ) -> ok=False", P.build_emcs_inbox(con, {}, mapping, 2)["ok"] is False)

print("\n" + ("ALL PASS ✅" if not FAILS else f"FAILED {len(FAILS)}: " + "; ".join(FAILS)))
sys.exit(1 if FAILS else 0)
