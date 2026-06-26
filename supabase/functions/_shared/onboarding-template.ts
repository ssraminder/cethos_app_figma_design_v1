/**
 * Shared renderer for the external-contractor Onboarding & Compliance Package
 * (the 7-document IQVIA package). Produces portal-compatible HTML
 * (h2 / h3 / p / ul / li / strong / em — the same conventions as
 * nda_templates.body_html) from per-contractor merge fields.
 *
 * The legal text is identical across contractors; only the merge fields and
 * the pre-incorporation framing (one contractor whose engagement predates the
 * incorporation of Cethos Solutions Inc.) vary. The fully-rendered HTML is
 * captured as the immutable audit snapshot in vendor_nda_signatures.signed_html_snapshot
 * at signing time, so editing this text only affects packages signed afterwards.
 *
 * Canonical source: the user-approved package content (2026-06-25), including
 * the explicit Supersession clause (Doc 1, s.11) and the online clickwrap
 * acknowledgement that replaces the print-and-return signature blocks.
 */

export interface OnboardingFields {
  contractor_name: string;
  reference_code: string;
  contractor_email: string;
  language_pair_display: string;
  engagement_effective_date_iso: string; // 'YYYY-MM-DD'
  pre_incorp: boolean;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 'YYYY-MM-DD' -> 'D Month YYYY' (e.g. '2020-01-14' -> '14 January 2020'). */
export function formatEffectiveDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function onboardingPackageTitle(): string {
  return "External Contractor — Onboarding & Compliance Package";
}

const COMPANY =
  "Cethos Solutions Inc. (corporation no. 12537494 Canada Inc.; Business Number 781741533RC0001), Calgary, Alberta";

export function renderOnboardingPackage(f: OnboardingFields): string {
  const n = esc(f.contractor_name);
  const ref = esc(f.reference_code);
  const lp = esc(f.language_pair_display);
  const em = esc(f.contractor_email);
  const ed = esc(formatEffectiveDate(f.engagement_effective_date_iso));

  let d1Open: string, d2Open: string, effClause: string;
  if (f.pre_incorp) {
    d1Open =
      `<p>This Independent Contractor Services Agreement (this “Agreement”) is made and entered into on the ` +
      `date of the Contractor’s electronic signature recorded below, in respect of an engagement that commenced ` +
      `on ${ed} with Cethos Solutions (the predecessor sole-proprietorship firm) and is continued by ${COMPANY} ` +
      `(the “Company”), with ${n} (the “Contractor”; reference ${ref}).</p>`;
    d2Open =
      `<p>Made and entered into on the date of the Contractor’s electronic signature recorded below, in respect ` +
      `of an engagement that commenced on ${ed} with Cethos Solutions (the predecessor firm) and is continued by ` +
      `${COMPANY} (the “Company”), with ${n} (the “Recipient”; reference ${ref}), in connection ` +
      `with the language services described in this package.</p>`;
    effClause =
      `<p><strong>8.</strong> Term &amp; Termination. This Agreement takes effect in respect of the engagement that ` +
      `commenced on ${ed} and continues until terminated by either Party on written notice. The Company may terminate ` +
      `immediately for breach. Obligations relating to confidentiality, data protection, and intellectual property ` +
      `survive termination.</p>`;
  } else {
    d1Open =
      `<p>This Independent Contractor Services Agreement (this “Agreement”) is made as of ${ed} ` +
      `(the “Effective Date”) between ${COMPANY} (the “Company”), and ${n} ` +
      `(the “Contractor”; reference ${ref}).</p>`;
    d2Open =
      `<p>Made as of ${ed} between ${COMPANY} (the “Company”) and ${n} (the “Recipient”; ` +
      `reference ${ref}), in connection with the language services described in this package.</p>`;
    effClause =
      `<p><strong>8.</strong> Term &amp; Termination. This Agreement begins on the Effective Date and continues until ` +
      `terminated by either Party on written notice. The Company may terminate immediately for breach. Obligations ` +
      `relating to confidentiality, data protection, and intellectual property survive termination.</p>`;
  }

  const P: string[] = [];

  // Cover / header
  P.push('<p><em>Cethos Solutions Inc. · Certified Translation &amp; Localization · Calgary, Alberta, Canada</em></p>');
  P.push('<h2>External Contractor — Onboarding &amp; Compliance Package</h2>');
  P.push('<ul>');
  P.push(`<li><strong>Contractor:</strong> ${n}</li>`);
  P.push(`<li><strong>Contractor reference:</strong> ${ref}</li>`);
  P.push(`<li><strong>Service / language pair:</strong> ${lp}</li>`);
  P.push(`<li><strong>Engagement effective date:</strong> ${ed}</li>`);
  P.push(`<li><strong>Contractor email:</strong> ${em}</li>`);
  P.push('</ul>');

  P.push('<h3>Package contents</h3>');
  P.push('<ul>' +
    '<li>1. Independent Contractor Services Agreement</li>' +
    '<li>2. Confidentiality &amp; Non-Disclosure Agreement</li>' +
    '<li>3. Data Security &amp; Acceptable-Use Attestation</li>' +
    '<li>4. Conflict of Interest Declaration</li>' +
    '<li>5. Quality, SOP &amp; Data-Protection Training Acknowledgement</li>' +
    '<li>6. Professional Code of Conduct Acknowledgement</li>' +
    '<li>7. Linguist Qualifications &amp; Working-Languages Declaration</li>' +
    '</ul>');

  P.push('<h3>How to sign online</h3>');
  P.push('<p>Please review every document below. When you are ready, enter your full legal name and tick the ' +
    'acknowledgement at the foot of this page, then click <strong>Agree &amp; Sign</strong>. Your signature is ' +
    'captured electronically together with a timestamp, your verified identity, and a copy of this exact package ' +
    '— there is no need to print, sign, or scan anything. If you have any question about a clause, contact your ' +
    'Cethos coordinator (Amrita Shah / Bobby Rawat) before signing.</p>');
  P.push('<p>Your CV is already on file with Cethos. Please make sure your coordinator also has a copy of your ' +
    'government-issued photo identification and your completed tax form (W-8BEN for non-Canadian contractors, or ' +
    'your local equivalent); you can upload these at any time from your vendor-portal profile.</p>');

  // Doc 1
  P.push('<h2>1. Independent Contractor Services Agreement</h2>');
  P.push('<p><em>Document 1 of 7</em></p>');
  P.push(d1Open);
  P.push('<p><strong>1.</strong> Engagement &amp; Services. The Company engages the Contractor on a non-exclusive, ' +
    'project-by-project basis to provide translation, revision, review, linguistic validation, and related ' +
    'language services for the language direction(s) shown above and as set out in individual purchase orders or ' +
    'assignments. Each accepted assignment is governed by this Agreement.</p>');
  P.push('<p><strong>2.</strong> Independent Contractor Status. The Contractor is an independent contractor, not an ' +
    'employee, partner, or agent of the Company. The Contractor is responsible for their own taxes, insurance, ' +
    'equipment, and statutory obligations, and is free to provide services to others except where doing so would ' +
    'breach confidentiality or create a conflict of interest.</p>');
  P.push('<p><strong>3.</strong> Standard of Performance. The Contractor shall perform all services with professional ' +
    'skill and care, in accordance with the Company’s instructions, style guides, glossaries, and quality ' +
    'standards aligned with ISO 17100, and shall meet agreed deadlines. The Contractor shall translate only into ' +
    'language(s) in which they have native or near-native competence.</p>');
  P.push('<p><strong>4.</strong> Fees &amp; Invoicing. Fees are agreed per assignment (per word, per hour, or per ' +
    'project as stated in the relevant purchase order). The Contractor shall invoice the Company for completed, ' +
    'accepted work, and the Company shall pay undisputed invoices within the agreed payment terms.</p>');
  P.push('<p><strong>5.</strong> Intellectual Property. All deliverables, translations, and derived materials created ' +
    'by the Contractor in performing the services are works made for the Company. The Contractor hereby assigns to ' +
    'the Company all intellectual property rights in the deliverables and waives all moral rights therein, ' +
    'effective on creation. Translation memories and glossaries remain the property of the Company or its clients.</p>');
  P.push('<p><strong>6.</strong> No Sub-contracting. The Contractor shall not sub-contract or delegate any assignment, ' +
    'in whole or in part, without the Company’s prior written consent. The Contractor shall not use any third ' +
    'party, employee, or unauthorized tool to perform the work.</p>');
  P.push('<p><strong>7.</strong> Confidentiality, Data &amp; Security. The Contractor shall comply with the ' +
    'Confidentiality &amp; Non-Disclosure Agreement and the Data Security &amp; Acceptable-Use Attestation in this ' +
    'package, which are incorporated by reference.</p>');
  P.push(effClause);
  P.push('<p><strong>9.</strong> Governing Law. This Agreement is governed by the laws of the Province of Alberta and ' +
    'the federal laws of Canada applicable therein, and the Parties submit to the exclusive jurisdiction of the ' +
    'courts of Alberta.</p>');
  P.push('<p><strong>10.</strong> Entire Agreement. This Agreement, together with the other documents in this package ' +
    'and any purchase orders, constitutes the entire agreement between the Parties and supersedes all prior ' +
    'understandings. Amendments must be in writing and signed by both Parties; if any provision is unenforceable, ' +
    'the remainder continues in effect.</p>');
  P.push('<p><strong>11. Supersession of Prior Agreements.</strong> Once signed, this Agreement and the other documents ' +
    'in this onboarding package constitute the entire agreement between the Contractor and the Company in respect ' +
    'of the Contractor’s engagement and the provision of language services, and <strong>supersede and replace in ' +
    `their entirety</strong> any and all prior agreements, arrangements, and understandings between the Contractor ` +
    `and the Company — and any predecessor of the Company, including Cethos Solutions, the predecessor ` +
    `sole-proprietorship through which the Contractor was originally engaged — whether written or oral, with ` +
    `effect from the Contractor’s original engagement date of ${ed}. Without limitation, this includes any ` +
    'confidentiality or non-disclosure agreement (an “NDA”) and any services, vendor, or independent-contractor ' +
    'agreement (a “Services Agreement” or “GSA”) previously entered into between the Contractor and the Company ' +
    'or its predecessor. Any such prior agreement is hereby terminated and replaced by this package; to the extent ' +
    'of any conflict, the terms of this package prevail.</p>');

  // Doc 2
  P.push('<h2>2. Confidentiality and Non-Disclosure Agreement</h2>');
  P.push('<p><em>Document 2 of 7</em></p>');
  P.push(d2Open);
  P.push('<p><strong>1.</strong> Purpose. In performing services the Recipient will receive or access confidential and ' +
    'proprietary information of the Company and its clients, including life-sciences, clinical, regulatory, and ' +
    'other sensitive material. This Agreement governs its protection.</p>');
  P.push('<p><strong>2.</strong> Confidential Information. “Confidential Information” means all non-public information ' +
    'disclosed by or on behalf of the Company or its clients, in any form, including source and target text, ' +
    'translation memories, glossaries, study and instrument materials, patient- or subject-related data, personal ' +
    'data, business and financial information, project files, client identities, methodologies, pricing, and any ' +
    'materials transmitted through the Company’s systems (including timeclock.cethos.com).</p>');
  P.push('<p><strong>3.</strong> Exclusions. Confidential Information excludes information that the Recipient can ' +
    'demonstrate: (a) was lawfully held without obligation of confidence before disclosure; (b) is or becomes ' +
    'public through no breach hereof; (c) is lawfully received from a third party without restriction; or (d) is ' +
    'independently developed without use of the Confidential Information. Disclosure required by law is permitted ' +
    'with prompt prior notice where lawful.</p>');
  P.push('<p><strong>4.</strong> Obligations. The Recipient shall hold Confidential Information in strict confidence; ' +
    'use it solely to perform services for the Company; not disclose it without the Company’s prior written ' +
    'consent; protect it with at least reasonable care; and not copy, store, or transmit it except as necessary ' +
    'and in accordance with the Company’s security requirements.</p>');
  P.push('<p><strong>5.</strong> Personal Data &amp; Data Protection. Where Confidential Information includes personal ' +
    'or health data, the Recipient shall process it only as instructed by the Company and in compliance with ' +
    'applicable laws, which may include Canada’s PIPEDA, the EU/UK GDPR, and HIPAA where applicable. The ' +
    'Recipient shall report any actual or suspected breach without undue delay and cooperate with audit and ' +
    'compliance requirements.</p>');
  P.push('<p><strong>6.</strong> Return or Destruction. On completion of an assignment or on request, the Recipient ' +
    'shall promptly return or securely destroy all Confidential Information and copies, and certify this in ' +
    'writing if requested.</p>');
  P.push('<p><strong>7.</strong> Term &amp; Survival. Confidentiality obligations survive the engagement and continue ' +
    'for five (5) years thereafter, and indefinitely for trade secrets and personal or patient data for so long ' +
    'as such information remains protected by law.</p>');
  P.push('<p><strong>8.</strong> Remedies. Any breach may cause irreparable harm for which damages are inadequate; the ' +
    'Company may seek injunctive relief in addition to other remedies.</p>');

  // Doc 3
  P.push('<h2>3. Data Security &amp; Acceptable-Use Attestation</h2>');
  P.push('<p><em>Document 3 of 7</em></p>');
  P.push(`<p>I, ${n} (contractor reference ${ref}), confirm that I will observe the following data-security ` +
    'requirements when handling Company and client materials:</p>');
  P.push('<ul>' +
    '<li>Keep all Company and client data on secured, password-protected, and where required encrypted devices, ' +
    'and never on shared, public, or unsecured computers.</li>' +
    '<li>Never store, upload, or process Company or client content on personal cloud accounts, personal email, or ' +
    'any unauthorized third-party service.</li>' +
    '<li>Not use any public, free, or consumer machine-translation engine, generative-AI, or large-language-model ' +
    'tool (including web-based chatbots) on Company or client content unless the Company has expressly authorized ' +
    'that specific tool in writing.</li>' +
    '<li>Use only the secure systems, file-transfer methods, and credentials provided by the Company, and never ' +
    'share my login credentials with anyone.</li>' +
    '<li>Apply current anti-malware protection and security updates to any device used for Company work.</li>' +
    '<li>Report any actual or suspected security incident, data breach, loss, or unauthorized access to the ' +
    'Company without undue delay and within 24 hours of becoming aware of it.</li>' +
    '<li>Securely delete or return all Company and client data on completion of each assignment or on request, ' +
    'retaining no copies.</li>' +
    '</ul>');
  P.push('<p>I understand that breach of these requirements may result in immediate termination of my engagement and ' +
    'may expose me to liability.</p>');

  // Doc 4
  P.push('<h2>4. Conflict of Interest Declaration</h2>');
  P.push('<p><em>Document 4 of 7</em></p>');
  P.push(`<p>I, ${n} (contractor reference ${ref}), declare that:</p>`);
  P.push('<ul>' +
    '<li>I am not aware of any personal, financial, family, or business relationship that conflicts, or may ' +
    'appear to conflict, with the interests of the Company or its clients in connection with the services I ' +
    'provide.</li>' +
    '<li>I will not, while engaged by the Company, undertake any work that would compromise the confidentiality ' +
    'of Company or client information, or place me in a position of divided loyalty on the same project or client ' +
    'matter.</li>' +
    '<li>I will promptly disclose to the Company in writing any actual, potential, or perceived conflict of ' +
    'interest that arises during my engagement.</li>' +
    '</ul>');
  P.push('<p>I confirm that I have no current conflict of interest to declare, except any that I have already disclosed ' +
    'in writing to my Cethos coordinator.</p>');

  // Doc 5
  P.push('<h2>5. Quality, SOP &amp; Data-Protection Training Acknowledgement</h2>');
  P.push('<p><em>Document 5 of 7</em></p>');
  P.push(`<p>I, ${n} (contractor reference ${ref}), acknowledge that:</p>`);
  P.push('<ul>' +
    '<li>I have received, read, and understood the Company’s Standard Operating Procedures relevant to my work, ' +
    'including those covering translation and revision, quality assurance, confidentiality, and data ' +
    'protection.</li>' +
    '<li>I have completed the Company’s onboarding and data-privacy/confidentiality awareness training (covering ' +
    'PIPEDA, GDPR, and HIPAA principles as applicable to the content I handle).</li>' +
    '<li>I agree to follow the Company’s ISO 17100-aligned processes and quality standards on every assignment, ' +
    'and to participate in periodic quality review.</li>' +
    '<li>I understand that I must seek clarification from the Company whenever a procedure or instruction is ' +
    'unclear, rather than proceeding on assumption.</li>' +
    '</ul>');

  // Doc 6
  P.push('<h2>6. Professional Code of Conduct Acknowledgement</h2>');
  P.push('<p><em>Document 6 of 7</em></p>');
  P.push(`<p>I, ${n} (contractor reference ${ref}), agree to uphold the following standards in all work for the ` +
    'Company:</p>');
  P.push('<ul>' +
    '<li>Act with honesty, integrity, and professionalism, and deliver work that is accurate and complete to the ' +
    'best of my ability.</li>' +
    '<li>Maintain the confidentiality of all Company and client information at all times.</li>' +
    '<li>Comply with all applicable laws and with anti-bribery, anti-corruption, and fair-dealing principles; ' +
    'neither offer nor accept improper inducements.</li>' +
    '<li>Treat colleagues, clients, and end-users with respect, without discrimination or harassment.</li>' +
    '<li>Avoid any conduct that could damage the reputation of the Company or its clients, and disclose any matter ' +
    'that could affect my fitness to perform the services.</li>' +
    '</ul>');

  // Doc 7
  P.push('<h2>7. Linguist Qualifications &amp; Working-Languages Declaration</h2>');
  P.push('<p><em>Document 7 of 7</em></p>');
  P.push(`<p>I, ${n} (contractor reference ${ref}), declare the following in support of my engagement and the ` +
    'Company’s ISO 17100 and client-audit requirements:</p>');
  P.push(`<ul><li><strong>Approved translation direction(s) for this engagement:</strong> ${lp} (reference ${ref})</li></ul>`);
  P.push('<p>My native / dominant language, my basis of qualification (degree, professional certification, or years of ' +
    'professional experience), and my relevant life-sciences / subject-matter experience are as set out in my CV ' +
    'and vendor profile on file with the Company, which I confirm are true and accurate.</p>');
  P.push('<p>I confirm that the information in my CV and in this declaration is true and accurate, that I translate ' +
    'only into the language(s) in which I have native or near-native competence, and that I will provide ' +
    'supporting evidence of my qualifications on request.</p>');

  // Online acknowledgement
  P.push('<h2>Acknowledgement &amp; Electronic Signature</h2>');
  P.push(`<p>By entering my full legal name and clicking “Agree &amp; Sign”, I, ${n} (reference ${ref}), confirm ` +
    'that I have read, understood, and agree to be bound by all seven documents in this onboarding package listed ' +
    'above. I confirm that the information in my CV and in this package is true and accurate. I agree that, on ' +
    'signature, this package supersedes and replaces my prior agreements with Cethos as set out in clause 11 of ' +
    'the Independent Contractor Services Agreement. I understand that my electronic signature — my typed legal ' +
    'name, this acknowledgement, and my verified identity — has the same legal effect as a handwritten ' +
    'signature.</p>');
  P.push('<p><em>Company signatory: Raminder Shah, Director &amp; CEO, Cethos Solutions Inc. A countersigned copy is ' +
    'retained on the Company’s records.</em></p>');

  return P.join("\n");
}
