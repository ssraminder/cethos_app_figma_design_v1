-- 20260515_iso_quiz_german_seed
--
-- ISO 17100 §6.1.2 competence quiz — German target language.
-- Tier-A pilot batch — language #3.
-- 24 new questions: 8 linguistic_textual + 8 cultural + 8 domain.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

INSERT INTO iso_competence_quizzes
  (competence_slug, domain, target_language_id, question, options, correct_option, explanation, difficulty, active)
VALUES
-- LINGUISTIC + TEXTUAL — German
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Welcher der folgenden deutschen Sätze verwendet die Wortstellung im Nebensatz korrekt?',
  '[{"label":"Ich weiß, dass er fährt nach Hause.","value":"a"},{"label":"Ich weiß, dass er nach Hause fährt.","value":"b"},{"label":"Ich weiß, fährt dass er nach Hause.","value":"c"},{"label":"Ich weiß, er fährt dass nach Hause.","value":"d"}]'::jsonb,
  'b',
  E'In Nebensätzen, die durch „dass" eingeleitet werden, steht das finite Verb am Ende des Nebensatzes. „fährt" steht am Schluss. Wesentliches grammatisches Merkmal des Deutschen.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Welche Form ist in formaler/schriftlicher Standardsprache korrekt? „___ des schlechten Wetters mussten wir den Termin verschieben."',
  '[{"label":"Wegen des schlechten Wetters","value":"a"},{"label":"Wegen dem schlechten Wetter","value":"b"},{"label":"Wegen das schlechte Wetter","value":"c"},{"label":"Wegen schlechtes Wetter","value":"d"}]'::jsonb,
  'a',
  E'„Wegen" steht in formaler/schriftlicher Standardsprache mit dem Genitiv. Umgangssprachlich wird oft Dativ verwendet, aber die Schriftnorm fordert den Genitiv.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Das englische „eventually" (im Sinne von „in the end") wird ins Deutsche korrekt übersetzt als:',
  '[{"label":"eventuell","value":"a"},{"label":"schließlich","value":"b"},{"label":"möglicherweise","value":"c"},{"label":"vielleicht","value":"d"}]'::jsonb,
  'b',
  E'Klassischer falscher Freund. „Eventuell" bedeutet auf Deutsch „möglicherweise" — NICHT „eventually" im englischen Sinn von „am Ende". Korrekt ist „schließlich", „letztendlich" oder „am Ende".',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Welcher Satz folgt der deutschen Großschreibungskonvention?',
  '[{"label":"das buch liegt auf dem tisch.","value":"a"},{"label":"Das Buch liegt auf dem Tisch.","value":"b"},{"label":"Das buch Liegt auf dem tisch.","value":"c"},{"label":"Das BUCH liegt auf dem TISCH.","value":"d"}]'::jsonb,
  'b',
  E'Im Deutschen werden alle Substantive großgeschrieben, unabhängig von ihrer Position im Satz. „Buch" und „Tisch" müssen großgeschrieben werden. Eine der zentralen Eigenheiten der deutschen Rechtschreibung.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'In formal German business correspondence, addressing a single unknown adult business contact, the correct pronoun is:',
  '[{"label":"du","value":"a"},{"label":"Sie","value":"b"},{"label":"ihr","value":"c"},{"label":"man","value":"d"}]'::jsonb,
  'b',
  E'Formal German uses « Sie » (always capitalized) for both polite singular and plural, with 3rd-person plural verb forms. « Du » in business correspondence with an unknown contact is a serious register error.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Was ist die übliche Kompositum-Form für „translation service company" auf Deutsch?',
  '[{"label":"Übersetzungsservicefirma","value":"a"},{"label":"Übersetzungsdienstleistungsunternehmen","value":"b"},{"label":"Service-Firma für Übersetzungen","value":"c"},{"label":"Übersetzung Dienstleistung Firma","value":"d"}]'::jsonb,
  'b',
  E'Deutsch bevorzugt zusammengesetzte Substantive. „Übersetzungsdienstleistungsunternehmen" ist grammatisch korrekt und idiomatisch, auch wenn es optisch lang ist. Übersetzer müssen Kompositbildung souverän beherrschen.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In norddeutschen geschriebenen/formellen Kontexten wird welche Vergangenheitsform bevorzugt?',
  '[{"label":"Perfekt (Ich habe gegessen)","value":"a"},{"label":"Präteritum (Ich aß)","value":"b"},{"label":"Plusquamperfekt (Ich hatte gegessen)","value":"c"},{"label":"Sie sind in allen Kontexten austauschbar","value":"d"}]'::jsonb,
  'b',
  E'Geschriebenes/formelles Deutsch bevorzugt das Präteritum. Gesprochenes Deutsch (besonders süddeutsch) bevorzugt das Perfekt. Wesentliche Register-Unterscheidung für Übersetzer.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Was bedeutet die deutsche Redewendung „die Daumen drücken" idiomatisch?',
  '[{"label":"Druck ausüben","value":"a"},{"label":"jemandem Glück wünschen","value":"b"},{"label":"ungeduldig sein","value":"c"},{"label":"sorgfältig zählen","value":"d"}]'::jsonb,
  'b',
  E'„Die Daumen drücken" entspricht englisch „fingers crossed" — jemandem Glück wünschen. Übersetzer müssen das idiomatisch erkennen und nicht wörtlich übertragen.',
  'medium', true
),

-- CULTURAL — German
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'When writing a formal business letter in Germany to an unknown male recipient, the appropriate greeting is:',
  '[{"label":"Lieber Herr Müller,","value":"a"},{"label":"Hallo Herr Müller,","value":"b"},{"label":"Sehr geehrter Herr Müller,","value":"c"},{"label":"An wen es betrifft,","value":"d"}]'::jsonb,
  'c',
  E'« Sehr geehrte/r Herr/Frau (Nachname), » is the standard German formal greeting. « Lieber » is for personal acquaintances; « Hallo » is informal. The closing comma is followed by an empty line, then the text begins lowercase.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In einem formalen deutschen Dokument wird das Datum „7 March 2026" geschrieben als:',
  '[{"label":"03/07/2026","value":"a"},{"label":"7-3-2026","value":"b"},{"label":"7. März 2026","value":"c"},{"label":"März 7, 2026","value":"d"}]'::jsonb,
  'c',
  E'Deutsches Format: „T. Monat JJJJ" mit Punkt nach dem Tag (Ordinalmarker) und großgeschriebenem Monatsnamen. Numerisches Format: TT.MM.JJJJ mit Punkten als Trennzeichen.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In Deutschland wird der Preis „€1,234.56" (US-amerikanische Notation) auf Deutsch formatiert als:',
  '[{"label":"€1,234.56","value":"a"},{"label":"1.234,56 €","value":"b"},{"label":"1234,56€","value":"c"},{"label":"€1.234,56","value":"d"}]'::jsonb,
  'b',
  E'Deutschland verwendet den Punkt als Tausender- und das Komma als Dezimaltrennzeichen — umgekehrt zum US-Englischen. Das Euro-Symbol steht NACH der Zahl mit einem geschützten Leerzeichen.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In einer deutschen Adresse lautet die Standardreihenfolge in der Straßenzeile:',
  '[{"label":"Hausnummer, dann Straßenname (z. B. „45 Hauptstraße")","value":"a"},{"label":"Straßenname, dann Hausnummer (z. B. „Hauptstraße 45")","value":"b"},{"label":"Postleitzahl, dann Straße","value":"c"},{"label":"Nur Gebäudename","value":"d"}]'::jsonb,
  'b',
  E'Deutsche Adressen schreiben den Straßennamen zuerst, dann die Hausnummer: „Hauptstraße 45". Gleich wie Spanisch und Italienisch, anders als Französisch/Englisch.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In einem formalen deutschen Geschäftskalender wird „3 PM" am häufigsten geschrieben als:',
  '[{"label":"3:00 PM","value":"a"},{"label":"3 Uhr nachmittags","value":"b"},{"label":"15:00 Uhr","value":"c"},{"label":"15 nachmittags","value":"d"}]'::jsonb,
  'c',
  E'Deutschland verwendet im formalen Kontext die 24-Stunden-Uhr. „15:00 Uhr" oder „15 Uhr" ist Standard, wobei „Uhr" als Substantiv nach der Uhrzeit angefügt wird.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In Deutschland ist welches Datum ein gesetzlicher Feiertag, der für Projektdeadlines relevant ist?',
  '[{"label":"3. Oktober — Tag der Deutschen Einheit","value":"a"},{"label":"4. Juli","value":"b"},{"label":"14. Juli","value":"c"},{"label":"Thanksgiving","value":"d"}]'::jsonb,
  'a',
  E'Der 3. Oktober (Tag der Deutschen Einheit) ist der bundeseinheitliche Nationalfeiertag. Weitere wichtige Daten: 1. Mai (Tag der Arbeit), 25.–26. Dezember; religiöse Feiertage variieren je nach Bundesland (Fronleichnam, Allerheiligen, Reformationstag, etc.).',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Auf einer deutschen Visitenkarte zeigt der Doktortitel „Dr." vor einem Namen an, dass die Person:',
  '[{"label":"Nur ein medizinischer Arzt","value":"a"},{"label":"Jeder Inhaber eines Doktorgrads (Dr. phil., Dr. iur., Dr. med., usw.)","value":"b"},{"label":"Ein leitender Angestellter","value":"c"},{"label":"Ein Militäroffizier","value":"d"}]'::jsonb,
  'b',
  E'In Deutschland gilt „Dr." für jeden Doktorgrad-Inhaber und ist Teil des amtlichen Namens in formalen Kontexten. Das Weglassen des „Dr." in der Übersetzung kann als respektlos wahrgenommen werden — vor allem in akademischen oder rechtlichen Texten.',
  'medium', true
),
(
  'cultural_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In einem deutschen Geschäftskontext erfordert der Wechsel von „Sie" zu „du" mit einem Kollegen:',
  '[{"label":"Eine bestimmte Anzahl von Jahren der Zusammenarbeit","value":"a"},{"label":"Eine gegenseitige Vereinbarung, normalerweise vom Älteren oder Ranghöheren zuerst angeboten","value":"b"},{"label":"Eine formelle Unternehmensrichtlinie","value":"c"},{"label":"Automatischen Wechsel nach 6 Monaten","value":"d"}]'::jsonb,
  'b',
  E'Das „Du-Anbieten" ist im deutschen Berufsleben ein bewusster sozialer Akt, der traditionell von der älteren oder ranghöheren Person initiiert wird. Übersetzer sollten Register-Signale wie diesen Wechsel im Zieltext bewahren.',
  'medium', true
),

-- DOMAIN — German
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'Ein Quelltext verwendet „best practices". Welche deutsche Übersetzung ist in EU-/deutschen Institutionskontexten vorzuziehen?',
  '[{"label":"beste Praktiken","value":"a"},{"label":"bewährte Praktiken / bewährte Verfahren","value":"b"},{"label":"Best Practices (Anglizismus)","value":"c"},{"label":"Alle drei werden verwendet; Wahl hängt von Kundenglossar und Kontext ab","value":"d"}]'::jsonb,
  'd',
  E'„Bewährte Praktiken" oder „bewährte Verfahren" ist die EU-/deutsche Institutionsstandardformulierung. „Best Practices" als Anglizismus ist im Wirtschaftsdeutsch weit verbreitet. „Beste Praktiken" ist ein Calque und stilistisch weniger gelungen. Kundenglossar entscheidet — in dessen Abwesenheit ist „bewährte Praktiken" am sichersten.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'During a translation project, the same source term appears in 50 segments. The translator should:',
  '[{"label":"Translate it differently each time to avoid repetition.","value":"a"},{"label":"Use the same translation throughout, or document a glossary if multiple translations are needed for context-driven reasons.","value":"b"},{"label":"Use synonyms in roughly 50% of occurrences for variety.","value":"c"},{"label":"Leave it untranslated in technical fields.","value":"d"}]'::jsonb,
  'b',
  E'Terminology consistency is a core ISO 17100 §5.3 requirement. Unjustified variation creates ambiguity and is a primary MQM Accuracy issue.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'When translating a German legal document referring to « das BGB » (Bürgerliches Gesetzbuch) into English, the translator should:',
  '[{"label":"Translate as « the Civil Code » with no further qualification.","value":"a"},{"label":"Translate as « the German Civil Code (BGB) » or add a translator''s note specifying jurisdiction.","value":"b"},{"label":"Translate as « the Civil Code of Germany » regardless of context.","value":"c"},{"label":"Leave « BGB » untranslated.","value":"d"}]'::jsonb,
  'b',
  E'Multiple German-speaking jurisdictions have civil-law codes (Germany BGB, Austria ABGB, Switzerland ZGB). Disambiguate with « German Civil Code » and parenthetical BGB. Standard practice in legal translation.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'A client provides a German style guide that prefers active voice. The source English contains an unavoidable passive sentence. The translator should:',
  '[{"label":"Always preserve the source structure exactly.","value":"a"},{"label":"Convert to active voice when the meaning is fully preserved and the style guide requires it.","value":"b"},{"label":"Ignore the style guide if it conflicts with literal translation.","value":"c"},{"label":"Ask the client to rewrite the source.","value":"d"}]'::jsonb,
  'b',
  E'Style guide compliance is documented under ISO 17100 §5.3. Active-vs-passive transformation is allowed when meaning is preserved. German also has the « man »-construction as a common passive alternative.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'A source text contains « The patient is 5 feet, 6 inches tall ». For a Germany target audience medical document, the translator should:',
  '[{"label":"Leave as « 5 Fuß, 6 Zoll ».","value":"a"},{"label":"Convert to metric: « 1,68 m » (with original in parentheses if regulated documents require traceability).","value":"b"},{"label":"Convert to metric only if the client explicitly specifies.","value":"c"},{"label":"Leave in feet/inches and add a footnote.","value":"d"}]'::jsonb,
  'b',
  E'Germany uses the metric system. Standard translator practice for non-US target audiences is to convert with the original in parentheses when regulatory or evidentiary traceability matters.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'A source English sentence is genuinely ambiguous — it has two plausible readings. The translator should:',
  '[{"label":"Pick the most likely reading and translate it.","value":"a"},{"label":"Translate ambiguously to preserve both readings (if German allows it).","value":"b"},{"label":"Submit a query to the client / project manager to disambiguate.","value":"c"},{"label":"Leave the segment untranslated and add a translator''s note.","value":"d"}]'::jsonb,
  'c',
  E'ISO 17100 §5.3.4 requires translators to raise queries when the source is unclear. Silently disambiguating risks introducing an error the client cannot detect.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  E'In einer zeitgenössischen Englisch-Deutsch-Übersetzung soll der Eigenname „John Smith" (fiktive lebende Person) wie folgt behandelt werden:',
  '[{"label":"Übersetzt als „Johannes Schmied"","value":"a"},{"label":"Transliteriert als „Tschon Smiß"","value":"b"},{"label":"Als „John Smith" beibehalten","value":"c"},{"label":"Nur übersetzt, wenn der Quelltext es ausdrücklich verlangt","value":"d"}]'::jsonb,
  'c',
  E'Die moderne deutsche Übersetzungspraxis bewahrt Eigennamen lebender Personen. Die historische Übersetzungspraxis (Christoph Kolumbus für Christopher Columbus, Johannes Calvin für John Calvin) gilt nur für kanonische religiöse, königliche oder historische Figuren.',
  'medium', true
),
(
  'domain_competence', NULL, '32664bcc-e81b-4b06-a266-6421d80d2772',
  'After completing a translation in a CAT tool, the translator''s mandatory next step before delivery is:',
  '[{"label":"Send to client immediately if the deadline is tight.","value":"a"},{"label":"Run a QA check covering consistency, missing translations, number formatting, and terminology.","value":"b"},{"label":"Re-read once on screen and submit.","value":"c"},{"label":"Ask a colleague to glance at it informally.","value":"d"}]'::jsonb,
  'b',
  E'ISO 17100 §5.3.3 requires a checking step (self-revision) before handover. CAT tool QA features (Xbench, MemoQ QA) catch missing translations, numeric mismatches, terminology inconsistencies, tag errors automatically.',
  'medium', true
);
