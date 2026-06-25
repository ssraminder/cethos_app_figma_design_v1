| | |
|---|---|
| **Document ID** | VAL-LV-001 |
| **Title** | RWS LV Onboarding — System Validation Script (tester's step-by-step) |
| **Owner** | Quality / Operations |
| **Audience** | Staff (validation tester) |
| **Status** | Draft v0.1 — 2026-06-25 |
| **Validates** | SOP-LV-001 (LV framework) + TRN-RWS-001 (RWS onboarding guide) |
| **System** | portal.cethos.com (live portal, using clearly-marked dummy data) |
| **Tester** | _________________________  **Date:** ______________ |

---

## 0. Read this first — what you are doing, and how

**What this is.** You are going to create **one pretend ("dummy") order** in the Cethos portal by following the steps below **exactly**, and check that the system behaves the way the guide says. This proves our written instructions match what the system really does.

**Why it matters.** If every step works, we sign off the procedure as correct. If a step does **not** work or looks different — **that is exactly what we want to find.** You write it down, and we fix it.

**How to fill this in.** After each step there is a line like this:

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

- Do the step **exactly** as written.
- Look at the line **"✅ You should see."**
- If what you see **matches** → put a tick in **PASS**.
- If it does **not** match (different words, an error, a missing button, or nothing happens) → tick **FAIL**, and in **Notes** write *what you actually saw*. If you can, paste a screenshot.
- **You cannot break anything** — it is all dummy data, and the **last step deletes it**.
- Go **in order, one step at a time. Do not skip ahead.**
- If you get stuck, write your question in Notes and ask — that is still useful feedback.

**Tip:** keep this guide on one half of your screen and the portal on the other half.

---

## 1. Before you start

1. Open **Google Chrome**.
2. Go to **portal.cethos.com** and **log in** with your staff account.
3. You should land on the admin area — a menu down the left side (Dashboard, Messages, Orders, Projects, …).

**The dummy values you will type.** Whenever a step asks for one of these, type it **exactly** as shown here:

| What | Value to type |
|---|---|
| Customer | **RWS** |
| PO number | **ZZTEST0001** |
| Project number | **ZZ-TEST-LV-001** |
| Service | **Standard Translation** |
| Source language | **English (United States)** |
| Target language | **English (India)** |
| Workflow template | **Translation Only** |
| Word count (quantity) | **500** |
| Rate | **0.10** |
| Document / instrument name | **ZZ Test Instrument (validation)** |
| Test linguist (vendor) | **ss.raminder@gmail.com** (our test account) |

> Everything starts with **ZZ-TEST** on purpose, so nobody mistakes it for real work.

---

## 2. The test — do these in order

### Step 1 — Open the new-order screen
1. In the left menu, click **Orders**.
2. On the Orders page (top-right area), click **New project**.

✅ **You should see:** a page titled **"New project"** with two choices near the top — **"Quote"** and **"Direct order"**.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 2 — Choose "Direct order"
1. Click the **Direct order** box. (It says *"Skip quote — invoice on delivery (AR customers)"*.)

✅ **You should see:** the **Direct order** box becomes highlighted/selected.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 3 — Pick the customer
1. Under **Customer**, click the box **"Search existing customer…"** and type **RWS**.
2. Click **RWS** in the list that drops down.

✅ **You should see:** RWS shown as the chosen customer.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 4 — Choose the service
1. Under **Service**, click **"Pick a service…"**.
2. Choose **Standard Translation**.

✅ **You should see:** **Standard Translation** shown as the service type.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 5 — Choose the languages
1. In **Source language**, type/choose **English (United States)**.
2. In **Target language**, type/choose **English (India)**.

✅ **You should see:** Source = English (United States), Target = English (India).

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 6 — Set a delivery date
1. In **Standard delivery**, click the date box and pick **any date about a week from today**.

✅ **You should see:** the date you picked shown in the box.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 7 — Choose the workflow template
1. Find **Workflow template** (it starts on "— pick later on the order page —").
2. Click it and choose **Translation Only · 3 steps**.

✅ **You should see:** **Translation Only** chosen. (This is the LV workflow: the linguist step → QA Review → Final Deliverable.)

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 8 — Add the line item (the work + price)
1. Scroll down to **Line items**.
2. **Description:** type **ZZ Test Instrument (validation)**.
3. **Unit:** choose **Per word**.
4. **Quantity:** type **500**.
5. **Rate:** type **0.10**.

✅ **You should see:** the **Total** for the line shows **50.00**.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 9 — Create the order
1. Scroll to the bottom and click the **Create** button (it may say "Create order" / "Create direct order").

✅ **You should see:** you are taken to the new order's page. Near the top it shows an order number (ORD-2026-…), **Order Status = In Production**, **Work Status = Pending**, and badges **Unbilled** and **Direct Order**. The customer is **RWS**.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 10 — Record the project number and PO number
1. On the order page, find **Project Reference / Project #**. Set it to **ZZ-TEST-LV-001**. *(If it isn't already a box you can type in, click **Edit Order** first.)*
2. Find where to enter the **PO number** and type **ZZTEST0001**. *(It may be under **Edit Order**.)*

✅ **You should see:** Project # = ZZ-TEST-LV-001 and PO = ZZTEST0001 saved on the order.
*(If you cannot find a place to type the PO number, that's important — tick FAIL and note it.)*

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 11 — Add the pre-production record (the §4.4 note)
1. On the order page, find the box **"Staff notes (internal)"** (it says *"Not shown to customers or vendors"*).
2. Copy-paste this text into it:
   > *Pre-production record (ISO 17100 §4.x). Client: RWS — PO ZZTEST0001. Project ZZ-TEST-LV-001. Service: Standard Translation (Translation Only). English (US) → English (India). Dummy validation order. QA = §5.3.3 revision by a second linguist before release.*
3. Click **Add note**.

✅ **You should see:** your note appears in the list below, with your name and the date.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 12 — Assign the linguist (vendor)
1. On the order, click the **Workflow** tab.
2. On **Step 1 (Translation)**, click **Find Vendor**.
3. In the linguist search, look for **ss.raminder@gmail.com**.
   - *If you don't see it:* clear any **language filters** and set **Service = All Services**, then look again. (The system only shows **ISO-qualified** linguists — that filtering is correct. Note which linguists appear.)
4. Select **ss.raminder@gmail.com** and confirm/assign.

✅ **You should see:** Step 1 now shows the linguist assigned.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 13 — Upload a deliverable on Step 1
1. On **Step 1**, use the upload option to attach **any small test file** (e.g. a Word doc with the words "dummy test").
2. Mark the step **delivered** (the button to do so).

✅ **You should see:** Step 1 shows a delivered file and its status moves on (toward QA).

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 14 — QA Review (Step 2)
1. Go to **Step 2 — QA Review**.
2. Approve / mark the QA review as passed.

✅ **You should see:** Step 2 shows approved/complete, and the workflow moves to the Final step.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 15 — Final Deliverable + complete the order (Step 3)
1. Go to **Step 3 — Final Deliverable**. Upload the same test file and mark it final / **Send to Client** (or "mark complete").
2. At the top of the order, change **Order Status** to **Completed** (or **Delivered**), if it hasn't moved there on its own.

✅ **You should see:** the order shows **Completed** (or Delivered), with all three workflow steps done.

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 16 — Log a client-feedback round
1. On the order, click the **Client Communications** tab.
2. Click **+ Add client email**.
3. Paste this dummy feedback:
   > *From RWS (dummy): "Please change 'colour' to 'color' in line 3 and re-deliver. Thanks."*
4. Save it.

✅ **You should see:** the feedback appears in the **"Client communications"** list, which is labelled **append-only** (you can add but not delete entries).

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

### Step 17 — Clean up (delete the dummy order)
1. At the top of the order, click **Cancel Order** (confirm if asked).

✅ **You should see:** the order's status changes to **Cancelled**. *(This removes the dummy from active work — that's the end of the test.)*

> **PASS ☐   FAIL ☐   Notes:** _______________________________________________

---

## 3. When you finish

- **Overall result:**  All steps PASS ☐    Some steps FAILED ☐ (see Notes)
- **Tester:** _________________________   **Signature:** _____________   **Date:** __________
- Hand this back with your ticks and Notes. Anything marked **FAIL** becomes a fix; once every step is **PASS**, **SOP-LV-001 + TRN-RWS-001 are signed off as validated.**

> **Note for the reviewer:** Steps 1–11 were checked against the live UI while writing this guide; Steps 12–16 (vendor assignment, QA, delivery, feedback log) describe the expected flow but had not yet been dry-run when this draft was written — Fayza's run is the first real test of those, so detailed Notes there are especially valuable.
