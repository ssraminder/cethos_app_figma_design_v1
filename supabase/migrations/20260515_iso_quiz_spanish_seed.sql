-- 20260515_iso_quiz_spanish_seed
--
-- ISO 17100 §6.1.2 competence quiz — Spanish (Spain) target language.
-- First language of the Tier-A pilot batch (Option A: es, fr, de, it, pt-BR).
--
-- 24 new questions at the cross-domain baseline:
--   - 8 linguistic_textual_competence (grammar, register, idiomaticity)
--   - 8 cultural_competence (Spain-specific conventions)
--   - 8 domain_competence (general translator practice in Spanish)
--
-- Difficulty: medium (translator-tier). The cross-language pool's
-- research_competence + technical_competence rows are reused.
-- (Schema CHECK constraint allows only easy/medium/hard.)
--
-- Companion to docs/qms/02-test-or-quiz-routing.md §3.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

INSERT INTO iso_competence_quizzes
  (competence_slug, domain, target_language_id, question, options, correct_option, explanation, difficulty, active)
VALUES
-- =====================================================================
-- LINGUISTIC + TEXTUAL COMPETENCE — Spanish (Spain)
-- =====================================================================
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'¿Cuál es la forma correcta del verbo? «Espero que ___ tiempo para revisar el documento antes de mañana.»',
  '[
    {"label":"tienes","value":"a"},
    {"label":"tengas","value":"b"},
    {"label":"tendrías","value":"c"},
    {"label":"tendrás","value":"d"}
  ]'::jsonb,
  'b',
  E'«Espero que» expresa deseo/esperanza y exige el presente de subjuntivo en la oración subordinada. «Tengas» es la forma correcta de subjuntivo para la 2.ª persona singular.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'Choose the correct verb for an event-location sentence: «El concierto ___ en el auditorio principal.»',
  '[
    {"label":"es","value":"a"},
    {"label":"está","value":"b"},
    {"label":"ha sido","value":"c"},
    {"label":"está siendo","value":"d"}
  ]'::jsonb,
  'a',
  E'For events (conciertos, reuniones, bodas), Spanish uses "ser" + location, not "estar". Compare physical-object location: «La sala ESTÁ en el primer piso» vs event location: «El concierto ES en el auditorio».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'Translate to natural Spanish: «I was reading when the phone rang.»',
  '[
    {"label":"Leía cuando el teléfono sonó.","value":"a"},
    {"label":"Leí cuando el teléfono sonaba.","value":"b"},
    {"label":"Estaba leyendo cuando el teléfono sonó.","value":"c"},
    {"label":"Estuve leyendo cuando el teléfono ha sonado.","value":"d"}
  ]'::jsonb,
  'c',
  E'Background ongoing action takes the imperfect or «estar + gerundio»; the punctual interrupting action takes the preterite. (C) is the most natural rendering; (A) is grammatically valid but less idiomatic in narrative context.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'En un documento jurídico, el término inglés «eventually» (in the sense "in the end") se traduce correctamente como:',
  '[
    {"label":"eventualmente","value":"a"},
    {"label":"finalmente","value":"b"},
    {"label":"posiblemente","value":"c"},
    {"label":"probablemente","value":"d"}
  ]'::jsonb,
  'b',
  E'Classic false friend. «Eventualmente» in Spanish means "occasionally/possibly" — NOT "eventually" in the English sense of "in the end". «Finalmente» or «con el tiempo» is correct.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'In a formal Spanish (Spain) text following RAE conventions, the correct way to introduce a quotation is:',
  '[
    {"label":"Dijo: ''''Hola''''.","value":"a"},
    {"label":"Dijo: \"Hola\".","value":"b"},
    {"label":"Dijo: «Hola».","value":"c"},
    {"label":"Dijo, «Hola.»","value":"d"}
  ]'::jsonb,
  'c',
  E'The RAE recommends guillemets (« ») as the primary quotation mark in formal Spanish, with double English quotes ("...") only as a second-level fallback. The closing period goes OUTSIDE the closing guillemet.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In formal Spanish (Spain) business correspondence, addressing a single unknown adult business contact, the correct pronoun is:',
  '[
    {"label":"tú","value":"a"},
    {"label":"usted","value":"b"},
    {"label":"vos","value":"c"},
    {"label":"vosotros","value":"d"}
  ]'::jsonb,
  'b',
  E'Formal singular address in Spain uses «usted» with 3rd-person singular verb. «Vos» is voseo (Argentina, parts of Central America); «vosotros» is 2nd-person plural informal. Choosing «tú» in formal business is a register error.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'Concordance with a collective noun: «La mayoría de los empleados ___ conformes con la propuesta.»',
  '[
    {"label":"está / Only singular is correct","value":"a"},
    {"label":"están / Only plural is correct","value":"b"},
    {"label":"Both «está conforme» and «están conformes» are accepted in standard Spain Spanish, depending on emphasis","value":"c"},
    {"label":"Neither is grammatically correct","value":"d"}
  ]'::jsonb,
  'c',
  E'The RAE accepts both agreements for «la mayoría de + plural noun»: singular (concordance with the head «mayoría») when emphasising the group as a unit; plural (concordance ad sensum) when emphasising the individuals. Both are correct in formal Spain Spanish.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'¿Qué significa la expresión idiomática «estar en las nubes»?',
  '[
    {"label":"estar muy contento","value":"a"},
    {"label":"estar distraído / soñando despierto","value":"b"},
    {"label":"estar borracho","value":"c"},
    {"label":"estar enfermo","value":"d"}
  ]'::jsonb,
  'b',
  E'«Estar en las nubes» literalmente "to be in the clouds" — idiomáticamente significa estar distraído, no prestar atención, soñar despierto. Recurring expression a translator may encounter in business/HR contexts.',
  'medium', true
),

-- =====================================================================
-- CULTURAL COMPETENCE — Spanish (Spain)
-- =====================================================================
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'When writing a formal business letter in Spain to an unknown male recipient, the appropriate greeting is:',
  '[
    {"label":"Querido señor:","value":"a"},
    {"label":"Hola señor,","value":"b"},
    {"label":"Estimado señor:","value":"c"},
    {"label":"A quien corresponda:","value":"d"}
  ]'::jsonb,
  'c',
  E'«Estimado señor:» (with colon, not comma) is the standard Spanish formal greeting. «Querido» implies acquaintance; «A quien corresponda» is "To Whom It May Concern" — used only when no recipient is known. Note the colon after the greeting (not a comma as in English).',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  E'In a formal Spanish (Spain) document, the date «7 March 2026» should be written as:',
  '[
    {"label":"03/07/2026","value":"a"},
    {"label":"7-3-2026","value":"b"},
    {"label":"7 de marzo de 2026","value":"c"},
    {"label":"Marzo 7, 2026","value":"d"}
  ]'::jsonb,
  'c',
  E'Spanish long-form: «día de mes de año» with lowercase month names. Numeric format is DD/MM/YYYY (never MM/DD/YYYY as in US English). «Marzo 7, 2026» is an Americanism that doesn''t match Spanish conventions.',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In Spain, the price «€1,234.56» (US English notation) is formatted in Spanish as:',
  '[
    {"label":"€1,234.56","value":"a"},
    {"label":"1.234,56 €","value":"b"},
    {"label":"1234,56€","value":"c"},
    {"label":"€1.234,56","value":"d"}
  ]'::jsonb,
  'b',
  E'Spain (and most of continental Europe) uses period as thousands separator and comma as decimal — opposite to US English. The euro symbol comes AFTER the number, separated by a non-breaking space. Missing the conversion is a major formatting error for financial documents.',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In a Spanish address, the standard order on the street line is:',
  '[
    {"label":"Number, then street name (e.g. «45 Calle Mayor»)","value":"a"},
    {"label":"Street name, then number (e.g. «Calle Mayor, 45»)","value":"b"},
    {"label":"Postcode, then street","value":"c"},
    {"label":"Building name only","value":"d"}
  ]'::jsonb,
  'b',
  E'Spanish addresses write the street name first followed by the number, separated by a comma: «Calle Mayor, 45». Reversing to the English «45 Calle Mayor» is incorrect and would confuse postal sorting.',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In a formal Spanish (Spain) business calendar, «3 PM» is most commonly written as:',
  '[
    {"label":"3:00 PM","value":"a"},
    {"label":"3 p. m.","value":"b"},
    {"label":"15:00","value":"c"},
    {"label":"3 horas tarde","value":"d"}
  ]'::jsonb,
  'c',
  E'Spain uses the 24-hour clock in formal/business contexts. AM/PM is unusual in writing. «3 p. m.» exists in informal contexts but is rarely seen in business correspondence.',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In Spain, which date is a national public holiday relevant to translation project deadlines?',
  '[
    {"label":"12 October — Día de la Hispanidad (Fiesta Nacional)","value":"a"},
    {"label":"4 July","value":"b"},
    {"label":"Thanksgiving (4th Thursday of November)","value":"c"},
    {"label":"None of the above","value":"d"}
  ]'::jsonb,
  'a',
  E'12 October (Día de la Hispanidad / Fiesta Nacional de España) is a national holiday in Spain. Translators delivering to Spanish clients must account for it (and other Spain-specific holidays like 6 January Reyes, 1 May, 6 December Constitución, 8 December Inmaculada).',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'On a Spanish business card or legal document, the abbreviation «D.» preceding a man''s name indicates:',
  '[
    {"label":"Doctor","value":"a"},
    {"label":"Don (traditional formal honorific, more formal than «Sr.»)","value":"b"},
    {"label":"Director","value":"c"},
    {"label":"Doña","value":"d"}
  ]'::jsonb,
  'b',
  E'«Don» (D.) and «Doña» (Dña.) are traditional Spanish honorifics, more formal than «Sr.»/«Sra.», commonly used in legal documents, contracts, and traditional formal correspondence (e.g. «D. Juan García López»). Doctor is abbreviated «Dr.»; Director is «Dir.».',
  'medium', true
),
(
  'cultural_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'The standard second-person plural informal pronoun used in Spain (but NOT in Latin America) is:',
  '[
    {"label":"ustedes","value":"a"},
    {"label":"vosotros","value":"b"},
    {"label":"vos","value":"c"},
    {"label":"todos","value":"d"}
  ]'::jsonb,
  'b',
  E'Spain uses «vosotros» for 2nd-person plural informal (with corresponding verb forms: vosotros tenéis, vosotros vais). Latin America uses «ustedes» for both formal and informal plural — «vosotros» sounds archaic or distinctly Iberian to a Latin American audience. Critical register distinction for Spain-Spanish targeting.',
  'medium', true
),

-- =====================================================================
-- DOMAIN COMPETENCE — Spanish (Spain) — general translator practice
-- =====================================================================
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'A source business text uses «best practices». Which Spanish translation is preferred in EU/Spain institutional contexts?',
  '[
    {"label":"mejores prácticas","value":"a"},
    {"label":"buenas prácticas","value":"b"},
    {"label":"prácticas óptimas","value":"c"},
    {"label":"All three are acceptable; choice depends on register and client glossary","value":"d"}
  ]'::jsonb,
  'd',
  E'All three are in active use. EU institutional Spanish (and the RAE) tends to prefer «buenas prácticas» as a more genuinely Spanish formulation; «mejores prácticas» is widespread but a partial calque from English; «prácticas óptimas» is more elegant in some contexts. A good translator follows the client''s glossary; in its absence, any of the three is defensible.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'During a translation project, the same source term appears in 50 segments. The translator should:',
  '[
    {"label":"Translate it differently each time to avoid repetition.","value":"a"},
    {"label":"Use the same translation throughout, or document a glossary if multiple translations are needed for context-driven reasons.","value":"b"},
    {"label":"Use synonyms in roughly 50% of occurrences for variety.","value":"c"},
    {"label":"Leave it untranslated in technical fields.","value":"d"}
  ]'::jsonb,
  'b',
  E'Terminology consistency is a core ISO 17100 §5.3 requirement and a primary MQM Accuracy/Terminology category. Unjustified variation creates ambiguity. If different renderings are needed in different contexts, document them in a project glossary so the choices are reproducible and reviewable.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'When translating a Spanish legal document referring to «el Código Civil» into English, the translator should:',
  '[
    {"label":"Translate as «the Civil Code» and leave it at that.","value":"a"},
    {"label":"Translate as «the Spanish Civil Code» or add a translator''s note specifying jurisdiction.","value":"b"},
    {"label":"Translate as «the Civil Code of Spain» regardless of context.","value":"c"},
    {"label":"Leave «Código Civil» untranslated in italics.","value":"d"}
  ]'::jsonb,
  'b',
  E'Legal references must be unambiguous about jurisdiction. Several Spanish-speaking countries have a «Código Civil» (Spain, Argentina, Mexico, etc.). A translator''s note or qualifier («the Spanish Civil Code») disambiguates and is standard practice in legal translation.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'A client provides a Spanish style guide that prefers active voice. The source English contains an unavoidable passive sentence. The translator should:',
  '[
    {"label":"Always preserve the source structure exactly, even against style guide guidance.","value":"a"},
    {"label":"Convert to active voice when the meaning is fully preserved and the style guide explicitly requires it.","value":"b"},
    {"label":"Ignore the style guide if it conflicts with literal translation.","value":"c"},
    {"label":"Ask the client to rewrite the source.","value":"d"}
  ]'::jsonb,
  'b',
  E'Style guide compliance is a documented requirement under ISO 17100 §5.3. Active-vs-passive transformation is allowed and often preferred when the meaning is preserved. If preservation is impossible without losing meaning (e.g. agent unknown), query the client.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'A source text contains «The patient is 5 feet, 6 inches tall.» For a Spain target audience medical document, the translator should:',
  '[
    {"label":"Leave as «5 pies, 6 pulgadas».","value":"a"},
    {"label":"Convert to metric: «1,68 m» (with original in parentheses if regulated documents require traceability).","value":"b"},
    {"label":"Convert to metric only if the client explicitly specifies.","value":"c"},
    {"label":"Leave in feet/inches and add a footnote.","value":"d"}
  ]'::jsonb,
  'b',
  E'Spain uses the metric system. Standard translator practice for non-US target audiences is to convert with the original in parentheses where regulatory or evidentiary traceability matters (e.g. clinical documents). Leaving feet/inches without conversion is a major Locale Conventions / Accuracy error.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'A source English sentence is genuinely ambiguous — it has two plausible readings. The translator should:',
  '[
    {"label":"Pick the most likely reading and translate it.","value":"a"},
    {"label":"Translate ambiguously to preserve both readings (if Spanish allows it).","value":"b"},
    {"label":"Submit a query to the client / project manager to disambiguate.","value":"c"},
    {"label":"Leave the segment untranslated and add a translator''s note.","value":"d"}
  ]'::jsonb,
  'c',
  E'ISO 17100 §5.3.4 requires translators to raise queries when the source is unclear. Silently disambiguating risks introducing an error that the client cannot detect. Preserving ambiguity is rarely possible across languages and creates its own problems. Best practice is the query.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'In a contemporary English-to-Spanish translation, the proper name «John Smith» (a fictional living person) should be:',
  '[
    {"label":"Translated as «Juan Herrero».","value":"a"},
    {"label":"Transliterated as «Yon Esmiz».","value":"b"},
    {"label":"Left as «John Smith».","value":"c"},
    {"label":"Translated only when the source explicitly asks.","value":"d"}
  ]'::jsonb,
  'c',
  E'Modern Spanish translation practice preserves proper names of living individuals. Translating personal names was a historical practice (e.g. «Juan Bautista» for «John the Baptist», «Cristóbal Colón» for «Christopher Columbus») now reserved for canonical religious, royal, or historical figures.',
  'medium', true
),
(
  'domain_competence', NULL, '356f22f3-d9e0-48a8-b54b-f6e12002887e',
  'After completing a translation in a CAT tool, the translator''s mandatory next step before delivery is:',
  '[
    {"label":"Send to client immediately if the deadline is tight.","value":"a"},
    {"label":"Run a QA check covering consistency, missing translations, number formatting, and terminology.","value":"b"},
    {"label":"Re-read once on screen and submit.","value":"c"},
    {"label":"Ask a colleague to glance at it informally.","value":"d"}
  ]'::jsonb,
  'b',
  E'ISO 17100 §5.3.3 requires the translator to perform a checking step (self-revision) before handover. CAT tool QA features (Xbench, MemoQ QA, memoQ Linguistic QA) catch missing translations, numeric mismatches, terminology inconsistencies, and tag errors automatically — far more reliable than a single human read-through.',
  'medium', true
);
