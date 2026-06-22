# -*- coding: utf-8 -*-
"""Unit tests for the pure logic in pull_data.py (no network / no credentials).
Run:  python test_logic.py
Uses the REAL mapping_supervisor_staff_.json + realistic sample rows."""
import sqlite3
from datetime import date, datetime, timedelta
import pull_data as P

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
check("map: 7 supervisors", len(supervisors) == 7)
check("map: ศุภชัย is a key", "นาย ศุภชัย เศรษฐชัยชาญ" in supervisors)
check("map: SEC125 -> ศุภชัย", code_to_sup.get("SEC125") == "นาย ศุภชัย เศรษฐชัยชาญ")
check("map: SE445 -> ภูรี ชูลาภโชคทวี", code_to_sup.get("SE445") == "นายภูรี ชูลาภโชคทวี")
check("surveyor SE445 -> {ภูรี ชูลาภโชคทวี}",
      P.surveyor_supervisors("SE445 นายวีระพงษ์ แก้วเขียว", code_to_sup, company_to_sups) == {"นายภูรี ชูลาภโชคทวี"})
shared = P.surveyor_supervisors("หจก ศรีราชาเคลม เซอร์วิส", code_to_sup, company_to_sups)
check("shared outsource under >=2 supervisors", len(shared) >= 2)
check("closer 'นายภูริ ภัทรภิรัก' -> key", P.closer_supervisor("นายภูริ ภัทรภิรัก", norm_sup_to_display) == "นายภูริ ภัทรภิรัก")
check("closer 'นายวรภพ หัตถิยา' (spacing) -> 'นาย วรภพ หัตถิยา'",
      P.closer_supervisor("นายวรภพ หัตถิยา", norm_sup_to_display) == "นาย วรภพ หัตถิยา")

# ---- end-to-end aggregate_daily (in-memory index) ----
con = sqlite3.connect(":memory:")
con.execute("""CREATE TABLE claim_closer(claim_no TEXT PRIMARY KEY, closer TEXT, surveyor TEXT,
               status TEXT, dispatch_dt TEXT, checker_dt TEXT, updated TEXT)""")
con.executemany("INSERT INTO claim_closer(claim_no,closer) VALUES(?,?)",
                [("C1", "นาย ศุภชัย เศรษฐชัยชาญ"), ("C2", "นายภูริ ภัทรภิรัก")])
con.commit()

today = date.today()
disp = (today - timedelta(days=3)).strftime("%Y-%m-%d 09:00")
isurvey_rows = [
    {"claim_no": "B1", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B2", "empcode": "SE445 นายวีระพงษ์ แก้วเขียว", "stt_desc": "เสร็จงาน",       "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B3", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "จบงาน",          "dispatch_dt": disp, "checkByName": "นาย ศุภชัย เศรษฐชัยชาญ", "checker_dt": disp},
    {"claim_no": "B4", "empcode": "SEC125 นาย สมภพ ปั้นเปรื่อง", "stt_desc": "ยกเลิกเคลม",      "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B5", "empcode": "หจก ศรีราชาเคลม เซอร์วิส",    "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
    {"claim_no": "B6", "empcode": "SE999 ไม่รู้จัก",            "stt_desc": "รอตรวจข้อมูล", "dispatch_dt": disp, "checkByName": "", "checker_dt": ""},
]
INV = {v: k for k, v in P.THAI_MONTHS.items()}
def thai(d):
    return f"{d.day:02d}/{INV[d.month]}/{d.year + 543} 00:00"
recent = today - timedelta(days=20)
oldd = today - timedelta(days=900)  # > 2 years
emcs_lists = {
    "continuous": [(thai(recent), "C1"), (thai(oldd), "C2"), (thai(recent), "C2"), (thai(recent), "UNKNOWN")],
    "edit": [(thai(recent), "C1")],
}
out = P.aggregate_daily(con, isurvey_rows, emcs_lists, mapping, 2)
sup = {s["name"]: s for s in out["supervisors"]}
S = sup["นาย ศุภชัย เศรษฐชัยชาญ"]
B = sup["นายภูริ ภัทรภิรัก"]
PR = sup["นายภูรี ชูลาภโชคทวี"]
SN = sup["นาย สันติ หรินทรสุทธิ"]

check("agg: ศุภชัย backlog = 2 (B1 + shared B5)", S["isurvey_backlog"] == 2)
check("agg: สันติ backlog = 1 (shared B5)", SN["isurvey_backlog"] == 1)
check("agg: ภูรี ชูลาภ backlog = 1 (B2)", PR["isurvey_backlog"] == 1)
check("agg: จบงาน & ยกเลิก excluded from backlog", "จบงาน" not in S["isurvey_by_status"] and "ยกเลิกเคลม" not in S["isurvey_by_status"])
check("agg: unmatched isurvey backlog = 1 (B6)", out["unmatched"]["isurvey_backlog"] == 1)
check("agg: ศุภชัย emcs continuous=1, edit=1 (C1)", S["emcs_continuous"] == 1 and S["emcs_edit"] == 1)
check("agg: ภูริ ภัทรภิรัก emcs continuous=1 (C2 recent; old filtered)", B["emcs_continuous"] == 1)
check("agg: unmatched emcs = 1 (UNKNOWN claim)", out["unmatched"]["emcs"] == 1)
check("agg: aging_days computed (int)", isinstance(S["isurvey_items"][0]["aging_days"], int))

print("\n" + ("ALL PASS ✅" if not FAILS else f"FAILED {len(FAILS)}: " + "; ".join(FAILS)))
import sys
sys.exit(1 if FAILS else 0)
