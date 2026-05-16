-- 20260515_iso_quiz_french_seed
--
-- ISO 17100 §6.1.2 competence quiz — French target language.
-- Tier-A pilot batch (Option A: es, fr, de, it, pt-BR) — language #2.
-- 24 new questions at the cross-domain baseline (domain IS NULL):
--   - 8 linguistic_textual_competence
--   - 8 cultural_competence
--   - 8 domain_competence
-- Difficulty: medium (translator-tier).
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

INSERT INTO iso_competence_quizzes
  (competence_slug, domain, target_language_id, question, options, correct_option, explanation, difficulty, active)
VALUES
-- LINGUISTIC + TEXTUAL — French
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'« Il faut que tu ___ tes devoirs avant ce soir. » Quelle est la forme correcte du verbe ?',
  '[{"label":"finis","value":"a"},{"label":"finisses","value":"b"},{"label":"finiras","value":"c"},{"label":"finirais","value":"d"}]'::jsonb,
  'b',
  E'« Il faut que » déclenche le subjonctif présent. « Finisses » est la 2e personne du singulier du subjonctif présent de « finir ».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Traduire en français naturel : « I was reading when the phone rang. »',
  '[{"label":"Je lisais quand le téléphone a sonné.","value":"a"},{"label":"Je lus quand le téléphone sonnait.","value":"b"},{"label":"Je lisais quand le téléphone sonnait.","value":"c"},{"label":"J''ai lu quand le téléphone sonna.","value":"d"}]'::jsonb,
  'a',
  E'Action de fond à l''imparfait (lisais) + action ponctuelle au passé composé (a sonné). Patron narratif standard du français contemporain. (B) inverse les aspects ; (D) utilise le passé simple qui est archaïque à l''oral.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans un document professionnel, le terme anglais « eventually » (au sens de « in the end ») se traduit correctement par :',
  '[{"label":"éventuellement","value":"a"},{"label":"finalement","value":"b"},{"label":"possiblement","value":"c"},{"label":"probablement","value":"d"}]'::jsonb,
  'b',
  E'Faux-ami classique. « Éventuellement » signifie « le cas échéant » en français, PAS « eventually » au sens anglais de « à la fin ». « Finalement » ou « à terme » est la traduction correcte.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans un texte français formel respectant les conventions typographiques, la façon correcte d''introduire une citation est :',
  '[{"label":"Il a dit : \"Bonjour.\"","value":"a"},{"label":"Il a dit: ''''Bonjour''''.","value":"b"},{"label":"Il a dit : « Bonjour. »","value":"c"},{"label":"Il a dit, «Bonjour».","value":"d"}]'::jsonb,
  'c',
  E'Le français utilise les guillemets français (« ») avec des espaces insécables. Notez aussi l''espace insécable avant les deux-points — convention typographique française stricte.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'In formal French business correspondence, addressing a single unknown adult business contact, the correct pronoun is:',
  '[{"label":"tu","value":"a"},{"label":"vous","value":"b"},{"label":"on","value":"c"},{"label":"nous","value":"d"}]'::jsonb,
  'b',
  E'French uses « vous » for both polite singular and plural. « Tu » with an unknown business contact is a serious register error.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Quelle est la forme de négation correcte en français écrit formel ?',
  '[{"label":"Je ne sais pas.","value":"a"},{"label":"Je sais pas.","value":"b"},{"label":"J''sais pas.","value":"c"},{"label":"Je sais point.","value":"d"}]'::jsonb,
  'a',
  E'Le français écrit formel exige les deux particules « ne » et « pas ». L''omission du « ne » est répandue à l''oral mais reste fautive à l''écrit professionnel.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Quelle est la forme correcte du participe passé ? « Les lettres que j''ai ___ hier. »',
  '[{"label":"écrit","value":"a"},{"label":"écrites","value":"b"},{"label":"écrits","value":"c"},{"label":"écrite","value":"d"}]'::jsonb,
  'b',
  E'Avec l''auxiliaire « avoir », le participe passé s''accorde en genre et en nombre avec le COD si celui-ci précède le verbe. « Les lettres » (féminin pluriel) précède, donc « écrites ».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Que signifie l''expression idiomatique française « avoir le coup de foudre » ?',
  '[{"label":"être frappé par la foudre","value":"a"},{"label":"tomber amoureux au premier regard","value":"b"},{"label":"avoir une idée soudaine","value":"c"},{"label":"perdre son sang-froid","value":"d"}]'::jsonb,
  'b',
  E'« Avoir le coup de foudre » = tomber amoureux au premier regard. Expression courante qu''un traducteur doit reconnaître et ne pas traduire littéralement.',
  'medium', true
),

-- CULTURAL — French
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'When writing a formal business letter in France to an unknown male recipient, the appropriate greeting is:',
  '[{"label":"Cher Monsieur,","value":"a"},{"label":"Monsieur,","value":"b"},{"label":"Bonjour Monsieur,","value":"c"},{"label":"À qui de droit,","value":"d"}]'::jsonb,
  'b',
  E'For an unknown recipient, plain « Monsieur, » is standard French formal practice. « Cher » implies acquaintance; « Bonjour » is informal. When gender is unknown, « Madame, Monsieur, » is used.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans un document français formel, la date « 7 March 2026 » s''écrit :',
  '[{"label":"03/07/2026","value":"a"},{"label":"7-3-2026","value":"b"},{"label":"le 7 mars 2026","value":"c"},{"label":"mars 7, 2026","value":"d"}]'::jsonb,
  'c',
  E'Format français : « le D mois YYYY » avec les noms de mois en minuscules. Format numérique : DD/MM/YYYY. « mars 7, 2026 » est un anglicisme qui ne correspond pas aux conventions françaises.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'En France, le prix « €1,234.56 » (notation anglo-saxonne) se formate en français comme :',
  '[{"label":"€1,234.56","value":"a"},{"label":"1 234,56 €","value":"b"},{"label":"1234,56€","value":"c"},{"label":"€1.234,56","value":"d"}]'::jsonb,
  'b',
  E'La France utilise l''espace insécable comme séparateur de milliers et la virgule comme séparateur décimal. Le symbole € vient après le nombre, séparé par une espace insécable. Format strictement standardisé par l''Imprimerie nationale et la norme ISO 31-0.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans une adresse française, l''ordre sur la ligne de rue est :',
  '[{"label":"Numéro puis nom de rue (ex. « 45 rue de la Paix »)","value":"a"},{"label":"Nom de rue puis numéro","value":"b"},{"label":"Code postal puis rue","value":"c"},{"label":"Nom du bâtiment uniquement","value":"d"}]'::jsonb,
  'a',
  E'Les adresses françaises s''écrivent : numéro puis type de voie (rue, avenue, boulevard) puis nom. « 45 rue de la Paix ». Contraire à la convention espagnole/allemande/italienne.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans un calendrier professionnel français formel, « 3 PM » s''écrit le plus couramment :',
  '[{"label":"3:00 PM","value":"a"},{"label":"3 h de l''après-midi","value":"b"},{"label":"15h00","value":"c"},{"label":"15 heures tantôt","value":"d"}]'::jsonb,
  'c',
  E'La France utilise le format 24 heures dans les contextes professionnels formels. « 15h00 » ou « 15h » avec « h » comme séparateur est la notation standard.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'En France, quelle date est un jour férié national pertinent pour les délais de projets de traduction ?',
  '[{"label":"14 juillet — Fête nationale","value":"a"},{"label":"4 juillet","value":"b"},{"label":"Thanksgiving (4e jeudi de novembre)","value":"c"},{"label":"Aucune des réponses ci-dessus","value":"d"}]'::jsonb,
  'a',
  E'Le 14 juillet (Fête nationale) est le jour férié national majeur en France. Autres dates importantes : 1er mai (Travail), 8 mai (Victoire 1945), 1er novembre (Toussaint), 11 novembre (Armistice), 25 décembre.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Sur un document professionnel français, l''abréviation « Me » devant un nom indique :',
  '[{"label":"Monsieur","value":"a"},{"label":"Maître (utilisé pour les avocats, notaires, certaines professions juridiques)","value":"b"},{"label":"Mademoiselle","value":"c"},{"label":"Monsieur émérite","value":"d"}]'::jsonb,
  'b',
  E'« Maître » (Me) est l''honorifique des professions juridiques (avocats, notaires) en France. À préserver dans la traduction juridique — supprimer cet honorifique peut être perçu comme une marque d''irrespect.',
  'medium', true
),
(
  'cultural_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans la correspondance professionnelle française contemporaine (depuis 2012), la façon appropriée de s''adresser à une femme adulte dont le statut matrimonial est inconnu est :',
  '[{"label":"Mademoiselle (si elle paraît jeune)","value":"a"},{"label":"Madame","value":"b"},{"label":"Madame ou Mademoiselle","value":"c"},{"label":"Femme","value":"d"}]'::jsonb,
  'b',
  E'Depuis la circulaire du 21 février 2012, les formulaires administratifs français ont supprimé « Mademoiselle ». Les traducteurs doivent utiliser « Madame » pour toutes les femmes adultes dans les contextes formels, sauf si l''intéressée se présente elle-même comme « Mademoiselle ».',
  'medium', true
),

-- DOMAIN — French
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Un texte source utilise « best practices ». Quelle traduction française est privilégiée dans les contextes institutionnels européens/français ?',
  '[{"label":"meilleures pratiques","value":"a"},{"label":"bonnes pratiques","value":"b"},{"label":"pratiques optimales","value":"c"},{"label":"Les trois sont acceptables ; le choix dépend du glossaire client","value":"d"}]'::jsonb,
  'b',
  E'« Bonnes pratiques » est la formulation standard dans les institutions européennes et françaises (Commission européenne, Légifrance). « Meilleures pratiques » est un calque de l''anglais, moins élégant. Suivre le glossaire client lorsqu''il existe ; en son absence, préférer « bonnes pratiques ».',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'During a translation project, the same source term appears in 50 segments. The translator should:',
  '[{"label":"Translate it differently each time to avoid repetition.","value":"a"},{"label":"Use the same translation throughout, or document a glossary if multiple translations are needed for context-driven reasons.","value":"b"},{"label":"Use synonyms in roughly 50% of occurrences for variety.","value":"c"},{"label":"Leave it untranslated in technical fields.","value":"d"}]'::jsonb,
  'b',
  E'Terminology consistency is a core ISO 17100 §5.3 requirement and a primary MQM Accuracy/Terminology category. Unjustified variation creates ambiguity.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'When translating a French legal document referring to « le Code civil » into English, the translator should:',
  '[{"label":"Translate as « the Civil Code » with no further qualification.","value":"a"},{"label":"Translate as « the French Civil Code » or add a translator''s note specifying jurisdiction.","value":"b"},{"label":"Translate as « the Civil Code of France » regardless of context.","value":"c"},{"label":"Leave « Code civil » untranslated in italics.","value":"d"}]'::jsonb,
  'b',
  E'Multiple French-speaking jurisdictions have a Code civil (France, Belgium, Quebec, Luxembourg). Disambiguate with « French Civil Code » or a translator''s note. Standard practice in legal translation.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'A client provides a French style guide that prefers active voice. The source English contains an unavoidable passive sentence. The translator should:',
  '[{"label":"Always preserve the source structure exactly.","value":"a"},{"label":"Convert to active voice when the meaning is fully preserved and the style guide requires it.","value":"b"},{"label":"Ignore the style guide if it conflicts with literal translation.","value":"c"},{"label":"Ask the client to rewrite the source.","value":"d"}]'::jsonb,
  'b',
  E'Style guide compliance is documented under ISO 17100 §5.3. Active-vs-passive transformation is allowed when meaning is preserved. French often prefers active constructions stylistically, so this kind of guide is common.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Un texte source contient « The patient is 5 feet, 6 inches tall ». Pour un document médical destiné à un public français, le traducteur doit :',
  '[{"label":"Laisser « 5 pieds, 6 pouces ».","value":"a"},{"label":"Convertir en métrique : « 1,68 m » (avec original entre parenthèses si la traçabilité réglementaire l''exige).","value":"b"},{"label":"Convertir en métrique uniquement si le client le demande explicitement.","value":"c"},{"label":"Laisser en pieds/pouces et ajouter une note de bas de page.","value":"d"}]'::jsonb,
  'b',
  E'La France utilise le système métrique. La pratique standard est de convertir avec l''original entre parenthèses lorsque la traçabilité réglementaire ou probatoire l''exige (documents cliniques par exemple). Laisser pieds/pouces sans conversion est une erreur majeure de conventions locales.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'A source English sentence is genuinely ambiguous — it has two plausible readings. The translator should:',
  '[{"label":"Pick the most likely reading and translate it.","value":"a"},{"label":"Translate ambiguously to preserve both readings (if French allows it).","value":"b"},{"label":"Submit a query to the client / project manager to disambiguate.","value":"c"},{"label":"Leave the segment untranslated and add a translator''s note.","value":"d"}]'::jsonb,
  'c',
  E'ISO 17100 §5.3.4 requires translators to raise queries when the source is unclear. Silently disambiguating risks introducing an error the client cannot detect.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  E'Dans une traduction contemporaine anglais → français, le nom propre « John Smith » (personne fictive vivante) doit être :',
  '[{"label":"Traduit en « Jean Forgeron ».","value":"a"},{"label":"Translittéré en « Djone Smise ».","value":"b"},{"label":"Conservé tel quel : « John Smith ».","value":"c"},{"label":"Traduit uniquement si le texte source le précise.","value":"d"}]'::jsonb,
  'c',
  E'La pratique moderne de traduction française conserve les noms propres de personnes vivantes. La traduction historique (Jean-Baptiste pour John the Baptist, Christophe Colomb pour Christopher Columbus) est réservée aux figures religieuses, royales ou historiques canoniques.',
  'medium', true
),
(
  'domain_competence', NULL, '3f020964-31f9-4310-b632-a46fb629231a',
  'After completing a translation in a CAT tool, the translator''s mandatory next step before delivery is:',
  '[{"label":"Send to client immediately if the deadline is tight.","value":"a"},{"label":"Run a QA check covering consistency, missing translations, number formatting, and terminology.","value":"b"},{"label":"Re-read once on screen and submit.","value":"c"},{"label":"Ask a colleague to glance at it informally.","value":"d"}]'::jsonb,
  'b',
  E'ISO 17100 §5.3.3 requires a checking step (self-revision) before handover. CAT tool QA features (Xbench, MemoQ QA) catch missing translations, numeric mismatches, terminology inconsistencies, tag errors — more reliable than a single human read.',
  'medium', true
);
