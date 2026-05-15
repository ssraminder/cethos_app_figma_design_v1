-- 20260515_iso_quiz_italian_seed
--
-- ISO 17100 §6.1.2 competence quiz — Italian target language.
-- Tier-A pilot batch — language #4.
-- 24 new questions: 8 linguistic_textual + 8 cultural + 8 domain.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

INSERT INTO iso_competence_quizzes
  (competence_slug, domain, target_language_id, question, options, correct_option, explanation, difficulty, active)
VALUES
-- LINGUISTIC + TEXTUAL — Italian
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'« Credo che lui ___ stanco oggi. » Quale forma del verbo è corretta?',
  '[{"label":"è","value":"a"},{"label":"sia","value":"b"},{"label":"era","value":"c"},{"label":"sarà","value":"d"}]'::jsonb,
  'b',
  E'« Credere che » regge il congiuntivo presente quando esprime opinione/incertezza personale. « Sia » è il congiuntivo presente della 3ª persona singolare di « essere ».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'Tradurre in italiano naturale: « I was reading when the phone rang. »',
  '[{"label":"Leggevo quando il telefono ha squillato.","value":"a"},{"label":"Ho letto quando il telefono squillava.","value":"b"},{"label":"Stavo leggendo quando il telefono squillò.","value":"c"},{"label":"Lessi quando il telefono ha squillato.","value":"d"}]'::jsonb,
  'a',
  E'Azione di sfondo all''imperfetto (leggevo) + azione puntuale al passato prossimo (ha squillato). Schema narrativo standard dell''italiano contemporaneo. (D) usa il passato remoto, raro al nord, comune al sud.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In un documento professionale, il termine inglese « eventually » (nel senso di « in the end ») si traduce correttamente come:',
  '[{"label":"eventualmente","value":"a"},{"label":"alla fine","value":"b"},{"label":"possibilmente","value":"c"},{"label":"probabilmente","value":"d"}]'::jsonb,
  'b',
  E'Falso amico classico. « Eventualmente » in italiano significa « se necessario / possibilmente », NON « eventually » nel senso inglese di « alla fine ». « Alla fine », « infine » o « in definitiva » sono corretti.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'Quale è la forma corretta in italiano?',
  '[{"label":"La amica è arrivata.","value":"a"},{"label":"L''amica è arrivata.","value":"b"},{"label":"La amica è arrivato.","value":"c"},{"label":"Lo amica è arrivata.","value":"d"}]'::jsonb,
  'b',
  E'L''articolo determinativo femminile « la » si elide in « l'' » davanti a vocale. « L''amica » è corretto. L''omissione dell''elisione è un errore comune di parlanti non nativi.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'In formal Italian business correspondence, addressing a single unknown adult business contact, the correct pronoun is:',
  '[{"label":"tu","value":"a"},{"label":"Lei","value":"b"},{"label":"voi","value":"c"},{"label":"noi","value":"d"}]'::jsonb,
  'b',
  E'Italian formal address uses « Lei » (capitalized in writing) with 3rd-person singular feminine verb forms — even when the addressee is male. « Voi » is plural informal (and was formal under archaic/southern usage). « Tu » with an unknown business contact is a register error.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'Quale forma è corretta in italiano?',
  '[{"label":"Italia è bellissima.","value":"a"},{"label":"L''Italia è bellissima.","value":"b"},{"label":"Una Italia è bellissima.","value":"c"},{"label":"Italia bellissima è.","value":"d"}]'::jsonb,
  'b',
  E'L''italiano usa l''articolo determinativo davanti ai nomi di Paesi (l''Italia, la Francia, il Giappone). Omettere l''articolo è un errore frequente nei parlanti non nativi.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'« Le ragazze ___ uscite ieri sera. » Quale verbo è corretto?',
  '[{"label":"hanno","value":"a"},{"label":"sono","value":"b"},{"label":"stanno","value":"c"},{"label":"vanno","value":"d"}]'::jsonb,
  'b',
  E'I verbi intransitivi di moto (uscire, andare, venire, ecc.) prendono « essere » come ausiliare. Il participio passato concorda con il soggetto: « uscite » (femminile plurale).',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'Cosa significa idiomaticamente l''espressione italiana « in bocca al lupo »?',
  '[{"label":"essere in pericolo","value":"a"},{"label":"buona fortuna (detto prima di una sfida)","value":"b"},{"label":"avere fame","value":"c"},{"label":"parlare ad alta voce","value":"d"}]'::jsonb,
  'b',
  E'« In bocca al lupo » è l''equivalente italiano di « break a leg » — augurio di fortuna prima di una prova, esame o colloquio. La risposta convenzionale è « crepi il lupo ». Da non tradurre letteralmente.',
  'medium', true
),

-- CULTURAL — Italian
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'When writing a formal business letter in Italy to an unknown male recipient, the appropriate greeting is:',
  '[{"label":"Caro Signor Rossi,","value":"a"},{"label":"Ciao Signor Rossi,","value":"b"},{"label":"Egregio Signor Rossi,","value":"c"},{"label":"A chi di competenza,","value":"d"}]'::jsonb,
  'c',
  E'« Egregio Signor (Cognome), » is the most formal Italian business greeting. « Gentile » is slightly less formal but still acceptable. « Caro » implies acquaintance.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In un documento italiano formale, la data « 7 March 2026 » si scrive:',
  '[{"label":"03/07/2026","value":"a"},{"label":"7-3-2026","value":"b"},{"label":"7 marzo 2026","value":"c"},{"label":"marzo 7, 2026","value":"d"}]'::jsonb,
  'c',
  E'Italiano: « D mese YYYY » senza preposizione « di », mese in minuscolo, senza virgola. Formato numerico: GG/MM/AAAA. « marzo 7, 2026 » è un anglicismo.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In Italia, il prezzo « €1,234.56 » (notazione inglese) si formatta come:',
  '[{"label":"€1,234.56","value":"a"},{"label":"1.234,56 €","value":"b"},{"label":"1234,56€","value":"c"},{"label":"€1.234,56","value":"d"}]'::jsonb,
  'b',
  E'L''Italia segue la formattazione europea/eurozona — punto come separatore di migliaia, virgola come decimale. Il simbolo dell''euro va dopo il numero, separato da uno spazio non separabile.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In un indirizzo italiano, l''ordine standard sulla riga della via è:',
  '[{"label":"Numero civico, poi nome della via","value":"a"},{"label":"Nome della via, poi numero civico (es. « Via Roma, 45 »)","value":"b"},{"label":"CAP, poi via","value":"c"},{"label":"Solo nome dell''edificio","value":"d"}]'::jsonb,
  'b',
  E'Gli indirizzi italiani scrivono prima il nome della via, poi il numero civico: « Via Roma, 45 » o « Via Roma 45 ». Come spagnolo/tedesco, opposto al francese.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In un calendario commerciale italiano formale, « 3 PM » si scrive più comunemente come:',
  '[{"label":"3:00 PM","value":"a"},{"label":"3 del pomeriggio","value":"b"},{"label":"15:00","value":"c"},{"label":"ore 15 di pomeriggio","value":"d"}]'::jsonb,
  'c',
  E'L''Italia usa il formato 24 ore nei contesti professionali formali. « 15:00 » o « ore 15 » è la notazione standard.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In Italia, quale data è una festa nazionale rilevante per le scadenze dei progetti di traduzione?',
  '[{"label":"2 giugno — Festa della Repubblica","value":"a"},{"label":"4 luglio","value":"b"},{"label":"14 luglio","value":"c"},{"label":"Solo 1° maggio","value":"d"}]'::jsonb,
  'a',
  E'Il 2 giugno (Festa della Repubblica) è la principale festa nazionale italiana. Altre date chiave: 25 aprile (Liberazione), 1° maggio (Festa dei Lavoratori), 15 agosto (Ferragosto), periodo natalizio.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In italiano, « Dottore/Dottoressa » applicato a una persona NON nel campo medico indica:',
  '[{"label":"Sono medici","value":"a"},{"label":"Hanno una laurea universitaria — usato ampiamente come titolo di cortesia","value":"b"},{"label":"Sono insegnanti","value":"c"},{"label":"Sono avvocati","value":"d"}]'::jsonb,
  'b',
  E'In italiano « dottore »/« dottoressa » si applica a chiunque abbia una laurea universitaria, non solo ai medici. Ampiamente utilizzato come titolo formale di cortesia. « Ingegnere » (Ing.), « Avvocato » (Avv.), « Architetto » (Arch.) sono titoli professionali specifici separati.',
  'medium', true
),
(
  'cultural_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In un contesto aziendale italiano moderno, il passaggio da « Lei » a « tu » con un collega di solito:',
  '[{"label":"Avviene automaticamente dopo la prima email","value":"a"},{"label":"Viene avviato per accordo reciproco, spesso dalla persona più anziana o senior","value":"b"},{"label":"È determinato dalla politica aziendale","value":"c"},{"label":"Avviene solo dopo anni di lavoro insieme","value":"d"}]'::jsonb,
  'b',
  E'Come « Du-anbieten » tedesco, « darsi del tu » in italiano è un passaggio sociale deliberato, spesso iniziato dalla persona più senior. Segnale di registro importante che i traduttori devono saper riconoscere.',
  'medium', true
),

-- DOMAIN — Italian
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'Un testo aziendale di origine usa « best practices ». Quale traduzione italiana è preferita nei contesti istituzionali UE/Italia?',
  '[{"label":"migliori pratiche","value":"a"},{"label":"buone pratiche","value":"b"},{"label":"pratiche ottimali","value":"c"},{"label":"Tutte e tre sono accettabili; la scelta dipende dal glossario del cliente","value":"d"}]'::jsonb,
  'd',
  E'« Buone pratiche » è la formulazione UE/italiana istituzionale standard (Commissione europea, ISTAT). « Migliori pratiche » è un calco dall''inglese. « Pratiche ottimali » è più elegante in alcuni contesti. Seguire il glossario del cliente quando esiste; in sua assenza, preferire « buone pratiche ».',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'During a translation project, the same source term appears in 50 segments. The translator should:',
  '[{"label":"Translate it differently each time to avoid repetition.","value":"a"},{"label":"Use the same translation throughout, or document a glossary if multiple translations are needed for context-driven reasons.","value":"b"},{"label":"Use synonyms in roughly 50% of occurrences for variety.","value":"c"},{"label":"Leave it untranslated in technical fields.","value":"d"}]'::jsonb,
  'b',
  E'Terminology consistency is a core ISO 17100 §5.3 requirement. Unjustified variation creates ambiguity.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'When translating an Italian legal document referring to « il Codice civile » into English, the translator should:',
  '[{"label":"Translate as « the Civil Code » with no further qualification.","value":"a"},{"label":"Translate as « the Italian Civil Code » or add a translator''s note specifying jurisdiction.","value":"b"},{"label":"Translate as « the Civil Code of Italy » regardless of context.","value":"c"},{"label":"Leave « Codice civile » untranslated in italics.","value":"d"}]'::jsonb,
  'b',
  E'Multiple jurisdictions have a Codice civile (Italy, San Marino, Vatican). Disambiguate with « Italian Civil Code » or a translator''s note. Standard practice in legal translation.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'A client provides an Italian style guide that prefers active voice. The source English contains an unavoidable passive sentence. The translator should:',
  '[{"label":"Always preserve the source structure exactly.","value":"a"},{"label":"Convert to active voice when the meaning is fully preserved and the style guide requires it.","value":"b"},{"label":"Ignore the style guide if it conflicts with literal translation.","value":"c"},{"label":"Ask the client to rewrite the source.","value":"d"}]'::jsonb,
  'b',
  E'Style guide compliance is documented under ISO 17100 §5.3. Active-vs-passive transformation is allowed when meaning is preserved. Italian also has the « si » impersonal construction as a common passive alternative.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'A source text contains « The patient is 5 feet, 6 inches tall ». For an Italy target audience medical document, the translator should:',
  '[{"label":"Leave as « 5 piedi, 6 pollici ».","value":"a"},{"label":"Convert to metric: « 1,68 m » (with original in parentheses if regulated documents require traceability).","value":"b"},{"label":"Convert to metric only if the client explicitly specifies.","value":"c"},{"label":"Leave in feet/inches and add a footnote.","value":"d"}]'::jsonb,
  'b',
  E'Italy uses the metric system. Standard translator practice for non-US target audiences is to convert with the original in parentheses when regulatory or evidentiary traceability matters.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'A source English sentence is genuinely ambiguous — it has two plausible readings. The translator should:',
  '[{"label":"Pick the most likely reading and translate it.","value":"a"},{"label":"Translate ambiguously to preserve both readings (if Italian allows it).","value":"b"},{"label":"Submit a query to the client / project manager to disambiguate.","value":"c"},{"label":"Leave the segment untranslated and add a translator''s note.","value":"d"}]'::jsonb,
  'c',
  E'ISO 17100 §5.3.4 requires translators to raise queries when the source is unclear.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  E'In una traduzione contemporanea dall''inglese all''italiano, il nome proprio « John Smith » (persona fittizia vivente) deve essere:',
  '[{"label":"Tradotto come « Giovanni Fabbro »","value":"a"},{"label":"Traslitterato come « Gion Smis »","value":"b"},{"label":"Lasciato come « John Smith »","value":"c"},{"label":"Tradotto solo se la fonte lo richiede esplicitamente","value":"d"}]'::jsonb,
  'c',
  E'La pratica moderna di traduzione italiana conserva i nomi propri di persone viventi. La traduzione storica (Giovanni Battista per John the Baptist, Cristoforo Colombo per Christopher Columbus) è riservata a figure religiose, regali o storiche canoniche.',
  'medium', true
),
(
  'domain_competence', NULL, '3274096c-598a-403e-9b2e-06b5af2ada82',
  'After completing a translation in a CAT tool, the translator''s mandatory next step before delivery is:',
  '[{"label":"Send to client immediately if the deadline is tight.","value":"a"},{"label":"Run a QA check covering consistency, missing translations, number formatting, and terminology.","value":"b"},{"label":"Re-read once on screen and submit.","value":"c"},{"label":"Ask a colleague to glance at it informally.","value":"d"}]'::jsonb,
  'b',
  E'ISO 17100 §5.3.3 requires a checking step (self-revision) before handover. CAT tool QA features catch missing translations, numeric mismatches, terminology inconsistencies, tag errors automatically.',
  'medium', true
);
