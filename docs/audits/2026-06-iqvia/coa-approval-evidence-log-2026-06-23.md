# COA Linguistic Validation — Approval Evidence Log (2026-06-23)

**Purpose:** Audit-ready record of the COA (clinical) translator approval pass for the IQVIA EQA-Vendor audit (29–30 Jun 2026). Every approval is evidence-based: only domains × language pairs with auditable evidence are qualified; everything else is noted and the applicant is asked (in-portal) for the missing item.

**Approver of record:** Raminder Shah — `raminder@cethos.com` (active super_admin). Approvals executed via the admin portal's authenticated session calling `cvp-approve-application` with a recorded §3.1.4 basis + curated domain set.

**Verification checklist (in order), per applicant:**
1. CV opened & read (`cv_storage_path`) — corroborates identity, education, experience, domains, language direction.
2. Documentation opened & read — degree/diploma actually **conferred** (not enrolment), name match, recognised translation degree (route a) or other-field degree (route b).
3. NDA — current, signed, active.
4. References — ≥1 **received & confirming** reference is sufficient evidence (per owner, 2026-06-23); note independence, confirmed years/domains, would-work-again.
5. Native-language claim verified (CV + country + target).
6. Domain claim verified — clinical domains require COA quiz **`assessment_recommendation`** = "Recommend approve" (or "Needs human review" cleared by reviewer); "Not recommended" ⇒ no COA/clinical.
7. Experience claim verified (references / CV).
8. Approve only domains × pairs with auditable evidence; COA is **EN→target** only. Note the rest; request missing info in-portal.

> **Key correction (2026-06-23):** the COA-readiness signal is the quiz's `assessment_recommendation`, **not** the MCQ `score_pct`. Of 30 score≥90 "passers": 8 "Recommend approve", 8 "Needs human review", 14 "Not recommended — translation failure(s)".

---

## APP-26-0555 — Aina Pellicer — Spain — EN→ES (Spain) — ❌ REMEDIATED (approval reverted)

- **Initial action:** approved as the pilot run on the lightweight gate (MCQ 100% + `has_translation_degree` flag). This was premature.
- **Document audit findings:**
  - **Degree (translation):** file on record is an **enrolment certificate** (Universitat Jaume I, Master's in Medical & Health Translation, 2025/26) — **not conferred**. Only her **Nursing** degree (Univ. Católica de Ávila, 2014) is conferred.
  - **COA quiz:** 100% MCQ but **`assessment_recommendation = "Not recommended — translation failure(s)"`** → clinical translation quality not demonstrated.
  - **References:** 1 received & confirming (MariLuz Ponce, peer/client, medical_pharma, would-work-again=yes, 5★) + several reference letters; structured year not confirmed.
- **Decision:** COA + clinical **revoked**, general **held**. QMS qualification → `under_review`; vendor → `applicant` (non-assignable); combos reset to `declared_unverified`. Audit note written to `qms.role_qualifications.internal_notes`.
- **Action to applicant:** in-portal request for the **conferred** translation master's certificate (~September). Salvageable once conferred + a passed translation/COA assessment.

---

## APP-26-0415 — Karine Blanchard Gagné — Canada — EN(CA)→FR(CA) — ✅ APPROVED (qualified)

- **CV (read):** "Experienced French Translator skilled in Medical, Pharma & Life Sciences", Quebec; **French (Native/Bilingual)**, English (Native/Bilingual); pharma/healthcare career.
- **Degree:** McGill BA (other field) — not a translation degree → route **c** used.
- **Experience (route c):** 2 references **received & matching** — Nicole Trudel (from 2020, medical_pharma, 5★, would-work-again) + Alexandre Da Sylvia (from 2014, 5★) ⇒ ≥12 yrs documented; medical_pharma domain corroborated. Server experience gate satisfied.
- **NDA:** active. **Native:** French (Quebec) ✓. **COA quiz:** Recommend approve.
- **Approved:** general + life_sciences + pharmaceutical + COA on EN(CA)→FR(CA). Vendor active, QMS qualified.

## APP-26-0596 — Maurice Dzeuga — Cameroon — EN→FR & EN→FR(CA) — ✅ APPROVED (qualified)

- **CV (read, 8pp):** English/French freelance translator; M.A. Translation; **BG Communications Montréal** reference letter (life-sciences translation, Feb–Oct 2022, "great independence").
- **Degree (route a):** M.A. in Translation, University of Buea (conferred 22 Aug 2019, GPA 3.12/4.0) — AI-screened 88%.
- **NDA:** active. **Native:** French (Cameroon Francophone; B.A. Bilingual Letters). **COA quiz:** Recommend approve. Refs waived (route a).
- **Approved:** general + medical + life_sciences + COA on EN→FR and EN→FR(CA). Vendor active, QMS qualified.

## APP-26-0694 — Rémi Coutant — France — EN→FR — ✅ APPROVED (qualified)

- **Degree (route a):** French national Master's in Translation & Interpretation, Université Sorbonne Nouvelle Paris 3 — **AUTO-VERIFIED 97%** (highest-confidence document review; `verified=true`). + Master's International Relations (Lisboa, other).
- **NDA:** active. **Native:** French (France) ✓. **COA quiz:** Recommend approve. Refs waived (route a). (CV text extraction blocked by tool redaction; degree auto-verification is the controlling evidence.)
- **Approved:** general + life_sciences + pharmaceutical + COA on EN→FR. Vendor active, QMS qualified.

## APP-26-0948 — Victor M. Vinuela — Spain — EN→ES — ✅ APPROVED (qualified, with caveat)

- **Auditable evidence:** route b — BSc Computer Science (degree document) + documented experience via reference (Christopher Baker, confirmed from 2022, ≥2y) + **COA quiz 9/10 Part-2 pass** (graded clinical test).
- **Native:** Spanish (Seville). **NDA:** active.
- **Caveat (noted on profile):** the one received reference is **legal**-domain with a rating anomaly (1/5 yet would-work-again=yes, no text); clinical competence rests on the graded COA quiz, not the CV; 2 further references pending.
- **Approved:** general + medical + life_sciences + COA on EN→ES.

## APP-26-0590 — Miriam Soares C. Martins — Brazil — EN→PT-BR — ✅ APPROVED (qualified, confirmatory QA flagged)

- **Auditable evidence:** route a — Postgraduate Specialisation in EN-PT Translation, PUC-Rio (degree document, system-typed `degree_translation`) + **COA quiz 3 Part-2 pass / 0 fail / MCQ 100%** (graded).
- **Native:** Portuguese (Brazil). **NDA:** active. (CV medical/Tradusa training = self-declared corroboration.)
- **Note:** 6 Part-2 items flagged for confirmatory human QA (0 failures) — reviewer spot-check recommended.
- **Approved:** general + medical + life_sciences + COA on EN→PT-BR.

## APP-26-0346 — Ilaria Fortuna — Italy — ⏸️ COA HELD (general-qualified, not clinical)

- Route a translation Master (Sectorial Translation EN-IT) supports **general**; **COA/clinical NOT evidenced**: COA quiz Part-2 = 0 pass / 9 flagged / 0 fail; documented specialisations are technical/legal/audiovisual (no clinical). Held COA pending human-reviewer sign-off. Strong general/technical/legal translator — candidate for separate general onboarding.

## APP-26-0486 — Alessandro Marchesello — Italy — ⏸️ COA HELD (general-qualified, not clinical)

- Route c documented experience (≥6y) supports **general** (no university degree — only secondary Maturità); **COA/clinical NOT evidenced**: COA quiz Part-2 = 0 pass / 9 flagged / 0 fail; fields automotive/IT/gaming/legal. Held COA pending reviewer sign-off.

## Messaged for ISO §3.1.4 basis — COA-passed but no degree/references on file (5)

Agustina 0782, Inmaculada 0903, Laura Dominguez 0806, romain 0554, Tony 0833 — COA quiz "Recommend approve" + NDA signed, but **no degree and no references** (CV alone is self-declared, not an evidence route). Sent in-portal request (`cvp-request-info`) for a degree **or** one confirming reference. To be approved once a §3.1.4 basis is on file (responses auto-screen on upload and resurface in the queue).

## Not COA-approvable — COA quiz "Not recommended — translation failure(s)" (14)

Incl. Aina 0555 (remediated), Sylvie 0530, Dana 0910, Debora 0255, Florie 0457, Laura Navetta 0781, Christèle 0799, Julio 0571, + 6. High MCQ score but the graded Part-2 clinical translations did not pass — **not** put on the COA roster. (Some may qualify for non-clinical work separately.)

---

## Outcome summary

| Outcome | Count | Who |
|---|---|---|
| ✅ COA-approved (qualified) | 5 | Karine, Maurice, Rémi, Victor, Miriam |
| ⏸️ COA held (general-qualified, not clinical) | 2 | Ilaria, Alessandro |
| ✉️ Messaged for §3.1.4 basis | 5 | Agustina, Inmaculada, Laura Dominguez, romain, Tony |
| ❌ Not COA-approvable (COA "Not recommended") | 14 | incl. Aina (remediated), Sylvie, Dana, Debora, … |

**Method note:** COA-roster suitability gates on the graded COA quiz **`assessment_recommendation`** (not MCQ `score_pct`) + an auditable §3.1.4 basis (translation degree, or reference-documented experience) + active NDA + native/target competence (evidenced by the degree + the EN→target COA quiz). **CVs are self-declared and were used only as corroboration, never as an evidence route.** All approvals signed under `raminder@cethos.com` (active super_admin).

---

# Batch 2 — General roster (verified translation degrees) — 2026-06-23

**Scope (owner decision):** approve **GENERAL** now on the verified-translation-degree basis, and **send the COA quiz** to each to build clinical evidence for a later clinical pass. **Depth:** every CV + degree opened/confirmed (degrees were already at the AUTO-VERIFIED tier; CVs read for native↔target).

**20 approved — all ISO 17100 §3.1.4 route a (verified translation degree, references waived), GENERAL competence only on EN→native-target, active + `qualified`:**

| App | Name | Target | App | Name | Target |
|---|---|---|---|---|---|
| 0132 | Navid Khademi | **Persian only** (az/tr held) | 0492 | Inês Ferreira | Portuguese (PT) |
| 0193 | Analía Boiero | Spanish (LatAm) | 0496 | Debora Pirone | French / French (CA) |
| 0218 | Jesica Russo | Spanish (LatAm) | 0543 | Begoña Mansilla | Spanish (Spain) |
| 0254 | Ninon Dion | French (CA) | 0628 | Adrieli Martins | Portuguese (BR) |
| 0323 | Francisco Fuentes | Spanish (LatAm) | 0748 | Angela Chamorro | Spanish (LatAm) |
| 0350 | Aline Sahin | Portuguese (BR) | 0872 | Dayane Zago | Portuguese (BR) |
| 0435 | Camilo Gonzalez | Spanish (LatAm) | 0895 | Clara Scharagrodsky | Spanish (AR/LatAm/US) |
| 0437 | Catalina Velásquez | Spanish (LatAm) | 0911 | Camille Calandre | French |
| 0463 | Cecilia Portechella | Spanish (LatAm) | 0945 | Ana Fierro | Spanish (LatAm) |
| 0473 | Jeronimo Gandini | Spanish (LatAm) | 0475 | Antonia Tofalo | Italian |

**Verification:** all 20 = vendor `active` + QMS `qualified` + exactly `general` domain (0 over-scope, 0 anomalies). The **verified degree itself** is the `verified=true` competence evidence that promotes the qualification (no test required for route a). Each approval note separates auditable evidence (verified degree) from self-declared CV.
**COA quiz:** dispatched to all 20 on EN→native-target (`coa_linguistic_validation` combo `test_sent`) — clinical evidence to be assessed when returned; clinical/COA approval is a **separate later pass** gated on the quiz `assessment_recommendation`.
**Into-English / non-native directions excluded** (e.g. Jeronimo/Catalina EN targets; Navid az/tr) — approved into-native only.

---

# Batch 3 — General roster (verified translation degrees) — 2026-06-23

Same workflow/scope as Batch 2 (general now via verified translation degree + COA quiz sent; every CV + degree opened). **18 approved — all §3.1.4 route a verified translation degree, GENERAL only on EN→native-target, active + `qualified`, COA quiz dispatched:**

| App | Name | Target | App | Name | Target |
|---|---|---|---|---|---|
| 0221 | Juan I. Viglino | Spanish (LatAm) | 0589 | Veronica Bertacchini | **Italian only** (de/ar/ru held) |
| 0308 | Ronie Paiva dos Santos | Portuguese (BR) | 0599 | Maria Cecilia Citra | Spanish (LatAm) |
| 0351 | Nora Glembocki | Spanish (LatAm/AR) | 0611 | Mickael Mezen | French |
| 0405 | Maria Florencia Laiño | Spanish (LatAm/AR) | 0629 | Miguel Aceituno | Spanish (Spain) |
| 0422 | Micaela Mascellani | Italian | 0631 | Matilde Suárez | Spanish (LatAm) |
| 0427 | Veronica Torres | Spanish (LatAm) | 0722 | Lara Silva Oliveira | Portuguese (PT) |
| 0439 | Marina Pareja Reina | Spanish (Spain) | 0749 | Mara Martínez | Spanish (LatAm) |
| 0497 | Mariana Pereira | Portuguese (PT) | 0838 | Pauline Guerreau | French |
| 0560 | Veronica Zadorozny | Spanish (AR) | 0972 | Lorena Vicente | Spanish (LatAm) |

**Verification:** 18/18 active+qualified, general-only (0 over-scope), COA quiz `test_sent`. Into-English / non-native dirs excluded (Mara/Matilde EN; Veronica B's German native claim is CV-only → not approved, only degree-aligned Italian).

**🐛 Bug found + worked around — uppercase email breaks approval.** Pauline (0838) email `Pauline.Guerreau.FR@gmail.com` failed approval (500): `cvp-approve-application` looks up the existing applicant-vendor with a **case-sensitive** `eq("email", app.email)`, misses the normalized (lowercase) row, attempts a duplicate vendor INSERT, and hits the unique-email constraint (the combo had already flipped to approved). Worked around by normalizing the application email to lowercase, then re-approving (succeeded). **Follow-up fix:** make the vendor lookup case-insensitive (lower(email)) in `cvp-approve-application`, and/or normalize `cvp_applications.email` on intake — this affects any applicant with uppercase in their email.

**Held (verified degree but unusable):** José Ángel Nogales (0801) + Violaine Glatt (0511) — verified translation degree but **no declared target language pair**, so nothing to qualify. Need a target pair before approval.

**Inflection note:** the AUTO-VERIFIED translation-degree pool is now largely exhausted across batches 2–3 (~38 approved). Batch 4+ will draw on *screened* (not-verified) translation degrees + a passed test, or 5-yr-reference candidates — which need a verified evidence source (test/quiz) or recorded human verification to reach `qualified`.

---

# Batch 4 — General roster (screened degree + passed test, or 5-yr references) — 2026-06-23

Lower-tier pool (no auto-verified degrees left): each candidate has a **passed graded general test (≥75 = the verified competence evidence that promotes them)** plus a §3.1.4 basis — **route a** (screened translation degree) or **route c** (5-yr+ references). Every CV opened (native confirmed) + every degree's screening reviewed. **13 approved**, GENERAL only on EN→native-target, active + `qualified`, COA quiz dispatched:

| App | Name | Target | Route | Test |
|---|---|---|---|---|
| 0044 | Ashraf Sohrabi Renani | Persian | a (+6y refs) | ✓ |
| 0057 | Juliano Euzebio de Gouvea | Portuguese (BR) | a | ✓ |
| 0124 | Mohamednoor Hassan Ibrahim | Somali | a | ✓ |
| 0159 | Marjan Karbalaee | Persian | a | ✓ (email fixed) |
| 0253 | Thomas d'Aquin Tabi Nkoumavok | French | a | ✓ |
| 0379 | Maria Carolina Godoy Ugolini | Spanish (LatAm) | a | 82 |
| 0392 | Jesus Dalila de la Rocha N. | Spanish (Mexico) | a | 88 |
| 0398 | Lietza Prats Videz | Spanish (Mexico) | a | 84 |
| 0067 | Behzad Radgizadeh | Persian | c (8y) | 88 |
| 0208 | Monica Pimienta Martinez | Spanish (LatAm) | c (5y) | 82 |
| 0259 | Daniela Alunni | Italian | c (16y) | 79 |
| 0294 | Angela Nery | Portuguese (BR) | c (18y) | 79 |
| 0393 | Joséphine Iannuzzelli | French | c (10y) | 91 |

**Held / not approved (3):**
- **Rahil Akbarpour (0106)** — REVERTED: graded test **74** (just under the ≥75 verified-evidence threshold) + screened degree ⇒ no verified evidence ⇒ qualification stayed `under_review`. Reverted to applicant; needs degree human-verification or a re-test.
- **Hemra Shirmohammadli (0045)** — held: degree is a vague "Certificate of Completion" (not clearly a translation degree) + native Persian not CV-confirmed.
- **Renata Nascimento (0299)** — held: degree doc is the **reverse/registration side** of a diploma, **32%** AI confidence + no references. Needs the actual degree.

**Also excluded from the pool (9):** route-b candidates with a passed test but **no reference-confirmed 2 yrs** (Jorge 0470, Catalina Baraldi 0384, Elías 0281, Alireza 0007, Azza 0156, Babak 0080, Celia 0519, Cipriano 0359, Khemrak 0095) — the server experience gate blocks route b without references. They need references on file first.

**🐛 Uppercase-email bug recurred:** Marjan (0159, `Aramesh.k.14033@…`) failed approval (same case-sensitive vendor-lookup issue as Pauline 0838) → normalized email + re-approved. Confirms this needs the source fix.
