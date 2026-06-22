#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extenBoard data puller
======================
Pulls "งานค้าง" (backlog) data from two systems, aggregates it PER SUPERVISOR,
and uploads the (PII-free) counts to the VPS for the dashboard extension.

Modes
-----
  python pull_data.py --backfill   One-time: build the claim->closer index from
                                   isurvey over the last N years (covers old emcs claims).
  python pull_data.py --daily      Daily run (Task Scheduler ~06:00): pull isurvey
                                   (last ~30 days) + emcs claim lists, aggregate, upload.
  add  --show   to run the browser headful (watch / verify the login on first run).

Auth: Playwright logs in to both systems with credentials from config.json.
Credentials never leave this machine; ONLY aggregated counts are uploaded.

See ../PROGRESS.md and the project memory for the verified data logic this implements.
"""

import argparse
import json
import re
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode

# NOTE: heavy deps (playwright, requests) are imported lazily inside the functions
# that use them, so the pure-logic functions can be unit-tested without them installed.

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
INDEX_DB = HERE / "claim_index.sqlite"
MAPPING_PATH = HERE.parent / "mapping_supervisor_staff_.json"

ISURVEY_REPORT_URL = "https://cloud.isurvey.mobi/web/php/report/get_data_report.php"
EMCS_BASE = "https://eclaim3.blueventuregroup.co.th/esurvey/"

# INBOX category -> GridView postback target (verified 2026-06)
EMCS_CATEGORIES = {
    "edit": "dgvInbox$ctl04$sname",        # รายงานแก้ไข
    "continuous": "dgvInbox$ctl06$sname",  # งานต่อเนื่อง
}

THAI_MONTHS = {
    "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
    "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
}

BACKLOG_EXCLUDE = {"จบงาน", "ยกเลิกเคลม"}  # งานค้าง = ทุกสถานะยกเว้นสองตัวนี้

TITLE_RE = re.compile(r"^(นางสาว|นาง|นาย|น\.ส\.|คุณ)\s*")
CODE_RE = re.compile(r"^(SEC?\d+)", re.IGNORECASE)


# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
def load_config():
    if not CONFIG_PATH.exists():
        sys.exit(f"[!] Missing {CONFIG_PATH}\n    Copy config.example.json -> config.json and fill it in.")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- #
# Name / code helpers  (matching rules verified 2026-06-20)
# --------------------------------------------------------------------------- #
def norm_name(s: str) -> str:
    """Normalize a Thai personal name for matching: drop 'Hi,', title prefix, all spaces."""
    if not s:
        return ""
    s = re.sub(r"^\s*Hi,\s*", "", s.strip())
    s = TITLE_RE.sub("", s)
    return re.sub(r"\s+", "", s)


def emp_code(s: str):
    """Leading employee code e.g. 'SE445 ...' -> 'SE445'. Returns None for outsource companies."""
    if not s:
        return None
    m = CODE_RE.match(s.strip())
    return m.group(1).upper() if m else None


def parse_isurvey_dt(s):
    """isurvey datetimes look like '2026-06-18 16:17'."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip()[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def parse_thai_dt(s):
    """emcs dates look like '19/มิ.ย./2569 16:24' (Buddhist year)."""
    if not s:
        return None
    try:
        d, mon, rest = s.strip().split("/")
        by = int(rest.split()[0])
        return date(by - 543, THAI_MONTHS[mon], int(d))
    except (ValueError, KeyError):
        return None


# --------------------------------------------------------------------------- #
# Mapping
# --------------------------------------------------------------------------- #
def load_mapping():
    """
    Returns:
      code_to_sup        : {EMPCODE -> supervisor_display_name}
      company_to_sups    : {normalized_company_name -> set(supervisor_display_name)}
      norm_sup_to_display: {normalized_supervisor_name -> supervisor_display_name}
      supervisors        : [display names in file order]
    """
    raw = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
    code_to_sup, company_to_sups, norm_sup_to_display = {}, {}, {}
    for sup, staff in raw.items():
        norm_sup_to_display[norm_name(sup)] = sup
        for entry in staff:
            code = emp_code(entry)
            if code:
                code_to_sup[code] = sup
            else:
                company_to_sups.setdefault(norm_name(entry), set()).add(sup)
    return code_to_sup, company_to_sups, norm_sup_to_display, list(raw.keys())


def surveyor_supervisors(empcode_value, code_to_sup, company_to_sups):
    """isurvey 'พนักงานตรวจสอบ' (empcode) -> set of supervisors that own it.
    Coded staff belong to exactly one supervisor; an outsource company may belong to several."""
    code = emp_code(empcode_value)
    if code:
        sup = code_to_sup.get(code)
        return {sup} if sup else set()
    return set(company_to_sups.get(norm_name(empcode_value), set()))


def closer_supervisor(checkbyname_value, norm_sup_to_display):
    """isurvey 'ผู้ตรวจสอบงาน' (checkByName) is itself a supervisor name -> its display name."""
    return norm_sup_to_display.get(norm_name(checkbyname_value))


# --------------------------------------------------------------------------- #
# Claim -> closer index (sqlite, persisted on the admin machine)
# --------------------------------------------------------------------------- #
def index_open():
    con = sqlite3.connect(INDEX_DB)
    con.execute(
        """CREATE TABLE IF NOT EXISTS claim_closer(
               claim_no    TEXT PRIMARY KEY,
               closer      TEXT,
               surveyor    TEXT,
               status      TEXT,
               dispatch_dt TEXT,
               checker_dt  TEXT,
               updated     TEXT
           )"""
    )
    con.commit()
    return con


def index_upsert(con, rows):
    con.executemany(
        """INSERT INTO claim_closer(claim_no, closer, surveyor, status, dispatch_dt, checker_dt, updated)
           VALUES(:claim_no, :closer, :surveyor, :status, :dispatch_dt, :checker_dt, :updated)
           ON CONFLICT(claim_no) DO UPDATE SET
               closer=excluded.closer, surveyor=excluded.surveyor, status=excluded.status,
               dispatch_dt=excluded.dispatch_dt, checker_dt=excluded.checker_dt, updated=excluded.updated""",
        rows,
    )
    con.commit()


def index_lookup_closer(con, claim_no):
    r = con.execute("SELECT closer FROM claim_closer WHERE claim_no=?", (claim_no,)).fetchone()
    return r[0] if r else None


# --------------------------------------------------------------------------- #
# Login (Playwright)  --  VERIFY selectors on first run with --show
# --------------------------------------------------------------------------- #
def login_isurvey(page, cfg):
    if not cfg.get("username") or not cfg.get("password"):
        sys.exit("[!] isurvey.username / isurvey.password are empty in config.json — fill the ISURVEY section "
                 "(backfill uses isurvey credentials).")
    page.goto(cfg["login_url"], wait_until="domcontentloaded", timeout=60000)
    # If a login form is present, fill it; otherwise the cookie session is already valid.
    if page.locator("input[type=password]").count():
        print("[isurvey] login form detected -> signing in")
        page.locator("input[type=password]").first.fill(cfg["password"])
        user = page.locator("input[type=text], input[type=email], input[name*=user i]").first
        if user.count():
            user.fill(cfg["username"])
        # submit
        btn = page.locator("button:has-text('Login'), input[type=submit], button[type=submit]").first
        if btn.count():
            btn.click()
        else:
            page.locator("input[type=password]").first.press("Enter")
        page.wait_for_load_state("networkidle", timeout=60000)
    # sanity: the logged-in app shows the header element
    try:
        page.wait_for_selector("#main-tab_header-title-textEl", timeout=20000)
        print("[isurvey] login OK")
    except Exception:
        print("[isurvey] WARN: header not found after login — login likely failed.")
        _dump_login_form(page, "isurvey")


def _dump_login_form(page, tag):
    """Print the current page's input/button structure so login selectors can be fixed."""
    try:
        info = page.evaluate(
            """() => ({
                url: location.href,
                inputs: [...document.querySelectorAll('input')].map(i => ({type:i.type, id:i.id, name:i.name, placeholder:i.placeholder})),
                buttons: [...document.querySelectorAll('button, input[type=submit], a')].slice(0, 20)
                    .map(b => ({tag:b.tagName, text:(b.textContent||b.value||'').trim().slice(0,30), id:b.id, cls:(b.className||'').slice(0,50)}))
            })"""
        )
        print(f"[{tag}] --- LOGIN FORM STRUCTURE (share this to fix selectors) ---")
        print(json.dumps(info, ensure_ascii=False, indent=2))
        print(f"[{tag}] ------------------------------------------------------------")
    except Exception as e:
        print(f"[{tag}] could not read form structure: {e}")


def login_emcs(page, cfg):
    if not cfg.get("username") or not cfg.get("password"):
        sys.exit("[!] emcs.username / emcs.password are empty in config.json — fill the EMCS section.")
    page.goto(cfg["login_url"], wait_until="domcontentloaded", timeout=60000)
    if page.locator("input[type=password]").count():
        print("[emcs] login form detected -> signing in")
        # email field then password then LOGIN button (verified layout 2026-06)
        email = page.locator("input[type=email], input[type=text]").first
        if email.count():
            email.fill(cfg["username"])
        page.locator("input[type=password]").first.fill(cfg["password"])
        btn = page.locator("button:has-text('LOGIN'), input[type=submit], button[type=submit]").first
        if btn.count():
            btn.click()
        else:
            page.locator("input[type=password]").first.press("Enter")
        page.wait_for_load_state("networkidle", timeout=60000)
    # The SE inbox ($sname links) lives on frmMainPage WITH its P1..P30 context. emcs often lands on
    # a billing-news page (frmBill_News.aspx?P1..P30) after login — re-open frmMainPage carrying the
    # SAME context params (going there bare drops the context and shows only the insurance side).
    if "frmMainPage" not in page.url:
        from urllib.parse import urlsplit
        qs = urlsplit(page.url).query
        try:
            page.goto(EMCS_BASE + "frmMainPage.aspx" + ("?" + qs if qs else ""),
                      wait_until="domcontentloaded", timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            print(f"[emcs] re-opened frmMainPage with carried context ({len(qs)} chars)")
        except Exception as e:
            print(f"[emcs] goto frmMainPage note: {e}")
    page.wait_for_timeout(1000)
    info = page.evaluate(
        """() => {
            const a = [...document.querySelectorAll('a')];
            const sname = a.filter(x => /dgvInbox\\$\\w+\\$sname/.test(x.getAttribute('href') || '')).length;
            return {
                url: location.href.split('?')[0],
                sname: sname,
                links: a.map(x => ({ t: (x.textContent || '').trim().slice(0, 26), h: (x.getAttribute('href') || '').slice(0, 64) }))
                        .filter(x => x.t).slice(0, 45)
            };
        }"""
    )
    if info.get("sname"):
        print(f"[emcs] login OK — SE inbox present (sname={info['sname']}) at {info['url']}")
    else:
        print(f"[emcs] SE inbox NOT on landing page ({info['url']}) — links on this page (share these):")
        print("[emcs] " + json.dumps(info["links"], ensure_ascii=False)[:2000])


# --------------------------------------------------------------------------- #
# isurvey pull (JSON API, via the logged-in browser context)
# --------------------------------------------------------------------------- #
PHP_NOTICE_RE = re.compile(r"<br\s*/?>\s*<b>(Notice|Warning|Deprecated)</b>:.*?on line <b>\d+</b><br\s*/?>", re.I | re.S)


def isurvey_fetch_range(page, d_from: date, d_to: date):
    """Fetch enquiry report for [d_from, d_to] (con_date=2) using the browser context's
    authenticated HTTP client (shares the logged-in cookies; avoids page CSP / navigation
    issues that break an in-page fetch). Returns arr_data list."""
    params = {
        "report_type": "enquiry", "con_date": "2",
        "date_from": d_from.strftime("%d/%m/%Y"), "date_to": d_to.strftime("%d/%m/%Y"),
        "empcode": "", "branch_id": "", "appv_status": "", "closeby": "", "inscompany": "",
    }
    url = ISURVEY_REPORT_URL + "?" + urlencode(params)
    raw, resp = None, None
    for attempt in range(4):                       # retry transient network errors (e.g. ECONNRESET)
        try:
            resp = page.context.request.get(url, timeout=180000)
            raw = resp.text()
            break
        except Exception as e:
            if attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"[isurvey] fetch error {d_from}..{d_to}: {e} -> retry in {wait}s ({attempt + 1}/4)")
                time.sleep(wait)
            else:
                print(f"[isurvey] GAVE UP {d_from}..{d_to} after 4 tries: {e}  (skipping this window)")
                return []
    body = PHP_NOTICE_RE.sub("", raw or "")        # strip stray PHP notices that can prepend the JSON
    ix = body.find("{")
    if ix > 0:
        body = body[ix:]
    try:
        data = json.loads(body)
    except Exception:
        print(f"[isurvey] non-JSON for {d_from}..{d_to} (HTTP {resp.status if resp else '?'}). page at: {page.url}")
        print(f"[isurvey]   body starts: {body[:140]!r}  (session dropped? close other isurvey logins)")
        return []
    return data.get("arr_data", []) or []


def isurvey_sanity_check(page):
    """Right after login, confirm the API actually returns data (catches dropped sessions)."""
    rows = isurvey_fetch_range(page, date.today() - timedelta(days=1), date.today())
    print(f"[isurvey] sanity check (yesterday..today): {len(rows)} rows "
          + ("OK" if rows else "-> 0 rows: session likely NOT authenticated (see note below)"))
    return bool(rows)


def isurvey_iter_months(page, start: date, end: date, chunk_days: int, pause_ms: int):
    """Yield arr_data rows across [start, end] in <=chunk_days windows."""
    cur = start
    while cur <= end:
        win_end = min(cur + timedelta(days=chunk_days - 1), end)
        rows = isurvey_fetch_range(page, cur, win_end)
        print(f"[isurvey] {cur} .. {win_end}: {len(rows)} rows")
        for r in rows:
            yield r
        time.sleep(pause_ms / 1000.0)
        cur = win_end + timedelta(days=1)


def row_to_index_record(r, now_iso):
    return {
        "claim_no": (r.get("claim_no") or "").strip(),
        "closer": (r.get("checkByName") or "").strip() or None,
        "surveyor": (r.get("empcode") or "").strip() or None,
        "status": r.get("stt_desc"),
        "dispatch_dt": r.get("dispatch_dt"),
        "checker_dt": r.get("checker_dt"),
        "updated": now_iso,
    }


# --------------------------------------------------------------------------- #
# emcs pull (claim lists for the two backlog categories)
# --------------------------------------------------------------------------- #
EMCS_CHANGEPAGE_JS = """
async (intPage) => {
  const res = await fetch('ajaxSurvey.aspx/changePage', {
    method: 'POST',
    headers: {'Content-Type':'application/json; charset=utf-8','X-Requested-With':'XMLHttpRequest'},
    body: JSON.stringify({intPage: intPage, searchType: 'command_inbox'})
  });
  const raw = await res.text();
  let payload;
  try { payload = JSON.parse(JSON.parse(raw).d); }
  catch (e) { return { rows: [], totalPage: 0, totalReport: -1, err: String(raw).slice(0, 100) }; }
  const tb = document.createElement('table'); tb.innerHTML = payload.reportList || '';
  const rows = [];
  tb.querySelectorAll('tr').forEach(tr => {
    const c = tr.children;
    if (c.length > 4) rows.push([c[0].textContent.trim().replace(/\\s+/g,' '), c[4].textContent.trim()]);
  });
  return { rows, totalPage: payload.totalPage, totalReport: payload.totalReport };
}
"""


def emcs_collect_category(page, postback_target, pause_ms):
    """Switch to an INBOX category via the page's own __doPostBack (scheduled with setTimeout so
    page.evaluate returns before the postback navigation destroys the context), then loop
    changePage. Returns [(date_str, claim_no), ...]."""
    has_dpb = page.evaluate("typeof window.__doPostBack === 'function'")
    try:
        with page.expect_navigation(timeout=60000):
            page.evaluate("(t) => { setTimeout(function () { __doPostBack(t, ''); }, 30); }", postback_target)
    except Exception as e:
        print(f"[emcs]   nav note ({postback_target}): {e}")
    page.wait_for_load_state("networkidle", timeout=60000)
    page.wait_for_timeout(500)
    first = page.evaluate(EMCS_CHANGEPAGE_JS, 1)
    out = list(first.get("rows") or [])
    total = int(first.get("totalPage") or 1)
    print(f"[emcs]   target={postback_target} doPostBack={has_dpb} url=…{page.url[-36:]} "
          f"page1={len(out)} totalPage={total} totalReport={first.get('totalReport')}"
          + (f" err={first.get('err')!r}" if first.get("err") else ""))
    for p in range(2, total + 1):
        time.sleep(pause_ms / 1000.0)
        try:
            out.extend(page.evaluate(EMCS_CHANGEPAGE_JS, p).get("rows") or [])
        except Exception as e:
            print(f"[emcs] page {p} error: {e}")
            break
    return out


# --------------------------------------------------------------------------- #
# Aggregation
# --------------------------------------------------------------------------- #
def new_sup_bucket():
    return {"isurvey_backlog": 0, "isurvey_by_status": {}, "emcs_continuous": 0,
            "emcs_edit": 0, "isurvey_items": [], "emcs_continuous_items": [], "emcs_edit_items": []}


def aggregate_daily(con, isurvey_rows, emcs_lists, mapping, max_age_years):
    code_to_sup, company_to_sups, norm_sup_to_display, supervisors = mapping
    buckets = {s: new_sup_bucket() for s in supervisors}
    unmatched = {"isurvey_backlog": 0, "emcs": 0}
    today = date.today()
    cutoff = today - timedelta(days=int(round(max_age_years * 365.25)))

    # --- isurvey backlog (status != จบงาน & != ยกเลิกเคลม) attributed by surveyor ---
    for r in isurvey_rows:
        status = (r.get("stt_desc") or "").strip()
        if status in BACKLOG_EXCLUDE:
            continue
        owners = surveyor_supervisors(r.get("empcode"), code_to_sup, company_to_sups)
        disp = parse_isurvey_dt(r.get("dispatch_dt"))
        aging = (today - disp.date()).days if disp else None
        item = {"claim_no": (r.get("claim_no") or "").strip(),
                "surveyor": r.get("empcode"), "status": status,
                "dispatch_dt": r.get("dispatch_dt"), "aging_days": aging}
        if not owners:
            unmatched["isurvey_backlog"] += 1
            continue
        for sup in owners:
            b = buckets[sup]
            b["isurvey_backlog"] += 1
            b["isurvey_by_status"][status] = b["isurvey_by_status"].get(status, 0) + 1
            b["isurvey_items"].append(item)

    # --- emcs backlog: claim -> closer (supervisor) via index ---
    for category, rows in emcs_lists.items():  # category in {"edit","continuous"}
        for date_str, claim_no in rows:
            claim_no = (claim_no or "").strip()
            if not claim_no:
                continue
            d = parse_thai_dt(date_str)
            if d and d < cutoff:           # keep only claims <= max_age_years old
                continue
            closer = index_lookup_closer(con, claim_no)
            sup = closer_supervisor(closer, norm_sup_to_display) if closer else None
            if not sup:
                unmatched["emcs"] += 1
                continue
            key = "emcs_edit" if category == "edit" else "emcs_continuous"
            buckets[sup][key] += 1
            aging = (today - d).days if d else None
            buckets[sup][key + "_items"].append({"claim_no": claim_no, "date": date_str, "aging_days": aging})

    totals = {
        "isurvey_backlog": sum(b["isurvey_backlog"] for b in buckets.values()),
        "emcs_continuous": sum(b["emcs_continuous"] for b in buckets.values()),
        "emcs_edit": sum(b["emcs_edit"] for b in buckets.values()),
    }
    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "date": today.isoformat(),
        "supervisors": [dict(name=s, **buckets[s]) for s in supervisors],
        "unmatched": unmatched,
        "totals": totals,
    }


# --------------------------------------------------------------------------- #
# Upload
# --------------------------------------------------------------------------- #
def upload(cfg_vps, payload):
    import requests
    try:
        r = requests.post(cfg_vps["upload_url"],
                          headers={"Authorization": f"Bearer {cfg_vps['token']}"},
                          json=payload, timeout=60)
        print(f"[upload] {r.status_code} {r.text[:200]}")
        r.raise_for_status()
    except Exception as e:
        print(f"[upload] FAILED: {e}")
        out = HERE / "last_payload.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[upload] saved payload locally -> {out}")


# --------------------------------------------------------------------------- #
# Modes
# --------------------------------------------------------------------------- #
def run_backfill(cfg, headless):
    from playwright.sync_api import sync_playwright
    years = cfg["settings"]["backfill_years"]
    chunk = cfg["settings"]["isurvey_chunk_days"]
    pause = cfg["settings"]["request_pause_ms"]
    start = date.today() - timedelta(days=int(round(years * 365.25)))
    con = index_open()
    now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    n = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        ctx = browser.new_context()
        page = ctx.new_page()
        login_isurvey(page, cfg["isurvey"])
        isurvey_sanity_check(page)
        batch = []
        for r in isurvey_iter_months(page, start, date.today(), chunk, pause):
            rec = row_to_index_record(r, now_iso)
            if rec["claim_no"] and rec["closer"]:   # index only closed jobs (those have a closer = supervisor)
                batch.append(rec); n += 1
            if len(batch) >= 1000:
                index_upsert(con, batch); batch = []
        if batch:
            index_upsert(con, batch)
        browser.close()
    print(f"[backfill] indexed {n} isurvey rows over {years}y -> {INDEX_DB}")


def run_daily(cfg, headless, emcs_only=False):
    from playwright.sync_api import sync_playwright
    s = cfg["settings"]
    pause = s["request_pause_ms"]
    con = index_open()
    mapping = load_mapping()
    now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    isurvey_rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        ctx = browser.new_context()
        page = ctx.new_page()

        # 1) isurvey: last N days  (skipped with --emcs-only for fast emcs debugging)
        if not emcs_only:
            login_isurvey(page, cfg["isurvey"])
            isurvey_sanity_check(page)
            start = date.today() - timedelta(days=s["isurvey_daily_days"])
            isurvey_rows = list(isurvey_iter_months(page, start, date.today(), s["isurvey_chunk_days"], pause))
            # keep the closer index fresh with this window's closed jobs
            recs = [row_to_index_record(r, now_iso) for r in isurvey_rows
                    if (r.get("claim_no") or "").strip() and (r.get("checkByName") or "").strip()]
            if recs:
                index_upsert(con, recs)

        # 2) emcs: claim lists for the two backlog categories
        emcs_page = ctx.new_page()
        login_emcs(emcs_page, cfg["emcs"])
        emcs_lists = {}
        for name, target in EMCS_CATEGORIES.items():
            rows = emcs_collect_category(emcs_page, target, pause)
            print(f"[emcs] {name}: {len(rows)} rows")
            emcs_lists[name] = rows

        browser.close()

    payload = aggregate_daily(con, isurvey_rows, emcs_lists, mapping, s["emcs_max_age_years"])
    print(f"[daily] totals: {payload['totals']}  unmatched: {payload['unmatched']}")
    upload(cfg["vps"], payload)


def main():
    ap = argparse.ArgumentParser(description="extenBoard data puller")
    ap.add_argument("--backfill", action="store_true", help="one-time: build claim->closer index")
    ap.add_argument("--daily", action="store_true", help="daily pull + aggregate + upload")
    ap.add_argument("--show", action="store_true", help="run browser headful (verify login)")
    ap.add_argument("--emcs-only", action="store_true", help="daily: skip isurvey, debug emcs only")
    args = ap.parse_args()
    if not (args.backfill or args.daily):
        ap.error("choose --backfill or --daily")
    cfg = load_config()
    headless = cfg["settings"].get("headless", True) and not args.show
    if args.backfill:
        run_backfill(cfg, headless)
    if args.daily:
        run_daily(cfg, headless, emcs_only=args.emcs_only)


if __name__ == "__main__":
    main()
