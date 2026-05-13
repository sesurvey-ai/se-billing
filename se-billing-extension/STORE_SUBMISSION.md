# Chrome Web Store Submission — SE-Billing v2.7.1

Use this file as a reference when filling in the Developer Dashboard.
Copy each block into the matching field in the Privacy practices tab.

---

## 1. Single Purpose

> SE-Billing is a productivity tool for professional insurance surveyors. It auto-fills service-fee fields in the iSurvey form (cloud.isurvey.mobi) based on the surveyor's selected province, district, and claim type, and lets the surveyor send a snapshot of the submitted form to a self-hosted billing server for later invoice preparation.

---

## 2. Permission Justifications

### `storage`

> Used to persist the user's chosen backend Server URL and API token in `chrome.storage.local` so the extension remembers the user's settings between sessions. No browsing history, no personal information, no third-party data is stored.

### Host permission: `https://cloud.isurvey.mobi/*`

> Required to read the form fields on the iSurvey survey page (province, district, claim type, surveyor name) and to auto-fill the matching service fees. The content script runs only on this exact domain and does not touch any other website.

### Host permission: `https://billing.sesurvey.cloud/*`

> The background service worker calls this URL to (a) fetch the user's fee-rate configuration via `GET /api/config` so the auto-fill knows the correct rates, and (b) `POST` a snapshot of each submitted form to `/api/captures` for the user's own audit log. This is the default Server URL — the user can replace it with their own self-hosted backend in the Options page.

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

This is a resubmission of v2.7.0 which was rejected with reference code **"Purple Nickel"** (privacy policy not pointing to a valid policy). Changes in v2.7.1:

- Replaced the previous Privacy Policy URL with a dedicated bilingual privacy policy page at `https://billing.sesurvey.cloud/privacy.html`.
- The policy now explicitly lists every field captured, the Limited Use disclosure, per-permission justifications, retention/deletion procedures, and contact information.

No functional code changes between 2.7.0 and 2.7.1 — the version bump is solely to enable resubmission.

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
- [ ] ZIP uploaded: `se-billing-extension-v2.7.1.zip`
- [ ] "Submit for review" pressed
