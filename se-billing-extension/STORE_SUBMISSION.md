# Chrome Web Store Submission — SE-Billing v2.8.0

Use this file as a reference when filling in the Developer Dashboard.
Copy each block into the matching field in the Privacy practices tab.

---

## 1. Single Purpose

> SE-Billing is a productivity tool for professional insurance surveyors and their supervisors who work in the iSurvey system (cloud.isurvey.mobi). It serves one purpose — helping iSurvey staff complete and track their own survey/billing work — through three closely related functions: (1) it auto-fills service-fee fields in the iSurvey form based on the selected province, district, and claim type; (2) it lets the surveyor send a snapshot of the submitted form to a self-hosted billing server for later invoice preparation; and (3) it shows the logged-in supervisor a read-only "outstanding work" (backlog) summary — counts and a claim list grouped by supervisor — pulled from that same self-hosted server.

---

## 2. Permission Justifications

### `storage`

> Used to persist the user's chosen backend Server URL and API token in `chrome.storage.local` so the extension remembers the user's settings between sessions. No browsing history, no personal information, no third-party data is stored.

### Host permission: `https://cloud.isurvey.mobi/*`

> Required to (a) read the form fields on the iSurvey survey page (province, district, claim type, surveyor name) and auto-fill the matching service fees, and (b) read the logged-in user's display name from the page header so the backlog dashboard can show that supervisor their own outstanding-work summary. The content scripts run only on this exact domain and do not touch any other website.

### Host permission: `https://billing.sesurvey.cloud/*`

> The background service worker calls this URL to (a) fetch the user's fee-rate configuration via `GET /api/config` so the auto-fill knows the correct rates, (b) `POST` a snapshot of each submitted form to `/api/captures` for the user's own audit log, and (c) fetch a read-only backlog summary via `GET /api/dashboard` to show the logged-in supervisor their outstanding-work counts and claim list. This is the default Server URL — the user can replace it with their own self-hosted backend in the Options page. All requests are authenticated with the user-supplied API token.

---

## 3. Remote Code Use

> No remote code is loaded or executed. All JavaScript shipped in the extension is bundled in the ZIP. The extension only makes JSON API calls (GET/POST) to the user-configured backend.

---

## 4. Data Usage Disclosures (check each that applies)

In the Developer Dashboard, the "Data usage" form asks which categories of user data the extension handles. Tick the following:

- [x] **Personally identifiable information** — surveyor name and inspector name as shown in the iSurvey form
- [x] **Authentication information** — the user-supplied API Bearer token (stored locally, sent only to the user-configured backend)
- [x] **Personal communications** — *No*
- [x] **Location** — *No*
- [x] **Web history** — *No*
- [x] **User activity** — form-submit events on cloud.isurvey.mobi (only when the user clicks "ยืนยันการตรวจสอบ")
- [x] **Website content** — values of the form fields the user fills in on cloud.isurvey.mobi
- [x] **Financial and payment information** — *No*
- [x] **Health information** — *No*

> Note (v2.8.0): the backlog dashboard only **reads** aggregate backlog counts and a claim-number list (grouped by supervisor) from the user's own backend via `GET /api/dashboard` and displays them. It does not collect or transmit any additional category of user data beyond what is listed above.

### Three required certifications (check all three)

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## 5. Privacy Policy URL

> https://billing.sesurvey.cloud/privacy.html

(Bilingual page: Thai + English. The page is publicly accessible with no authentication required and is served by the same backend the extension communicates with.)

---

## 6. Resubmission Notes (for reviewers)

**v2.8.0 (current submission) — new feature: read-only backlog dashboard.**
This version adds an "outstanding work" (backlog) view for the logged-in supervisor:

- A new content script (`dashboard-badge.js`) reads the logged-in user's display name from the iSurvey page header and shows a small badge with their outstanding-work counts; clicking a badge opens a sortable claim list.
- The extension popup gains a "งานค้าง / Backlog" tab showing the same per-supervisor summary.
- Data is fetched **read-only** via `GET /api/dashboard` from the same user-configured backend (authenticated with the user's API token). The endpoint returns only aggregate counts and a claim-number list — no new category of user data is collected, and no remote code is loaded or executed.
- Single Purpose (block 1) and the `cloud.isurvey.mobi` / `billing.sesurvey.cloud` justifications (block 2) have been updated to cover this feature.

**History — v2.7.1:** resubmission of v2.7.0, which was rejected with reference code **"Purple Nickel"** (privacy policy not pointing to a valid policy). Fixed by adding a dedicated bilingual privacy policy page at `https://billing.sesurvey.cloud/privacy.html` that lists every field captured, the Limited Use disclosure, per-permission justifications, retention/deletion procedures, and contact information.

---

## 7. Quick Submission Checklist

- [ ] Privacy Policy URL set to `https://billing.sesurvey.cloud/privacy.html`
- [ ] Single Purpose filled in (block 1)
- [ ] Justification for `storage` permission filled in
- [ ] Justification for `cloud.isurvey.mobi` host permission filled in
- [ ] Justification for `billing.sesurvey.cloud` host permission filled in
- [ ] "Remote code" answered: *No remote code*
- [ ] Data Usage disclosures ticked (block 4)
- [ ] Three certifications ticked (block 4)
- [ ] Single Purpose + host-permission justifications updated for the v2.8.0 backlog dashboard (blocks 1 & 2)
- [ ] Privacy policy page still live at `https://billing.sesurvey.cloud/privacy.html` (ideally mentions the `GET /api/dashboard` read)
- [ ] ZIP uploaded: `se-billing-extension-v2.8.0.zip`
- [ ] "Submit for review" pressed
