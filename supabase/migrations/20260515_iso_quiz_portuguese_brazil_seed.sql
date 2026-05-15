-- 20260515_iso_quiz_portuguese_brazil_seed
--
-- ISO 17100 §6.1.2 competence quiz — Portuguese (Brazil) target language.
-- Tier-A pilot batch — language #5 (final).
-- 24 new questions: 8 linguistic_textual + 8 cultural + 8 domain.
-- Applied to lmzoyezvsjgsxveoakdr 2026-05-15.

INSERT INTO iso_competence_quizzes
  (competence_slug, domain, target_language_id, question, options, correct_option, explanation, difficulty, active)
VALUES
-- LINGUISTIC + TEXTUAL — Portuguese (Brazil)
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'« Espero que você ___ tempo para revisar o documento. » Qual é a forma correta?',
  '[{"label":"tem","value":"a"},{"label":"tenha","value":"b"},{"label":"terá","value":"c"},{"label":"teria","value":"d"}]'::jsonb,
  'b',
  E'« Espero que » exige o presente do subjuntivo. « Tenha » é a 3ª pessoa do singular do presente do subjuntivo de « ter ».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Traduzir para português brasileiro natural: « I was reading when the phone rang. »',
  '[{"label":"Eu lia quando o telefone tocou.","value":"a"},{"label":"Eu li quando o telefone tocava.","value":"b"},{"label":"Eu estava lendo quando o telefone tocava.","value":"c"},{"label":"Eu lera quando o telefone tinha tocado.","value":"d"}]'::jsonb,
  'a',
  E'Ação de fundo no pretérito imperfeito (lia) + ação pontual no pretérito perfeito (tocou). Padrão narrativo mais natural do português brasileiro. (C) « estava lendo » também é válido mas menos conciso.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em um documento profissional, o termo inglês « eventually » (no sentido de « in the end ») se traduz corretamente como:',
  '[{"label":"eventualmente","value":"a"},{"label":"finalmente / no fim","value":"b"},{"label":"possivelmente","value":"c"},{"label":"provavelmente","value":"d"}]'::jsonb,
  'b',
  E'Falso amigo clássico. « Eventualmente » em português significa « ocasionalmente/possivelmente » — NÃO « eventually » no sentido inglês de « no fim ». « Finalmente », « por fim » ou « no fim » são corretos.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Na correspondência formal contemporânea do português brasileiro, o pronome padrão da 2ª pessoa do singular é:',
  '[{"label":"tu (usado no sul do Brasil, mas raro na escrita formal)","value":"a"},{"label":"você (padrão na maior parte do Brasil para contextos formais e informais)","value":"b"},{"label":"senhor/senhora (apenas em contextos honoríficos específicos)","value":"c"},{"label":"vós (arcaico)","value":"d"}]'::jsonb,
  'b',
  E'O português brasileiro usa « você » como pronome padrão da 2ª pessoa do singular. « Tu » é regional (sul, partes do nordeste). « Vós » é arcaico/literário. « Senhor/Senhora » é reservado para contextos muito formais ou hierárquicos.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'A forma do português brasileiro para « you are working » mais comumente usa:',
  '[{"label":"Tu trabalhas (forma do português europeu)","value":"a"},{"label":"Você está trabalhando","value":"b"},{"label":"Vós estais a trabalhar","value":"c"},{"label":"Você está a trabalhar (forma do português europeu)","value":"d"}]'::jsonb,
  'b',
  E'O português brasileiro usa « estar + gerúndio (-ndo) » para o presente contínuo (está trabalhando). O português europeu usa « estar a + infinitivo » (está a trabalhar). Distinção crítica para a localização BR-PT.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'« Talvez ele ___ amanhã. » Qual é a forma correta?',
  '[{"label":"vem","value":"a"},{"label":"venha","value":"b"},{"label":"virá","value":"c"},{"label":"viria","value":"d"}]'::jsonb,
  'b',
  E'« Talvez » + subjuntivo é o padrão para expressar incerteza em português. « Venha » é o presente do subjuntivo de « vir ». A forma indicativa « vem » só seria usada se a certeza for muito alta.',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'No português brasileiro, qual é a forma gramaticalmente correta com « a gente »?',
  '[{"label":"A gente vai (3ª pessoa do singular)","value":"a"},{"label":"A gente vamos","value":"b"},{"label":"A gente vão","value":"c"},{"label":"A gente vou","value":"d"}]'::jsonb,
  'a',
  E'« A gente » é gramaticalmente singular (substantivo coletivo) mesmo significando « nós » semanticamente. Toma formas verbais da 3ª pessoa do singular. Forma coloquial brasileira muito frequente para « nós ».',
  'medium', true
),
(
  'linguistic_textual_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'O que significa idiomaticamente a expressão brasileira « pisar em ovos »?',
  '[{"label":"ser desajeitado","value":"a"},{"label":"agir com muito cuidado / lidar com uma situação delicada","value":"b"},{"label":"andar devagar","value":"c"},{"label":"ser vegetariano","value":"d"}]'::jsonb,
  'b',
  E'« Pisar em ovos » = « to walk on eggshells » em inglês. Expressão comum no português brasileiro para descrever cuidado extremo em situações delicadas. Tradutores devem reconhecer como idiomática.',
  'medium', true
),

-- CULTURAL — Portuguese (Brazil)
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'When writing a formal business letter in Brazil to an unknown male recipient, the appropriate greeting is:',
  '[{"label":"Querido Senhor Silva,","value":"a"},{"label":"Olá Senhor Silva,","value":"b"},{"label":"Prezado Senhor Silva,","value":"c"},{"label":"A quem possa interessar,","value":"d"}]'::jsonb,
  'c',
  E'« Prezado(a) Senhor(a) » is the standard Brazilian Portuguese formal business greeting. « Querido » implies acquaintance; « Olá » is informal. « A quem possa interessar » is « To Whom It May Concern », used only when no recipient is known.',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em um documento brasileiro formal, a data « 7 March 2026 » é escrita como:',
  '[{"label":"03/07/2026","value":"a"},{"label":"7-3-2026","value":"b"},{"label":"7 de março de 2026","value":"c"},{"label":"março 7, 2026","value":"d"}]'::jsonb,
  'c',
  E'Português brasileiro: « D de mês de AAAA » com nomes de mês em minúsculo. Formato numérico: DD/MM/AAAA. « março 7, 2026 » é um anglicismo que não corresponde às convenções brasileiras.',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'No Brasil, o preço « R$1,234.56 » (notação inglesa) é formatado como:',
  '[{"label":"R$ 1,234.56","value":"a"},{"label":"R$ 1.234,56","value":"b"},{"label":"1234,56 R$","value":"c"},{"label":"R$1.234,56 (sem espaço)","value":"d"}]'::jsonb,
  'b',
  E'O Brasil usa ponto como separador de milhares e vírgula como decimal. O símbolo do Real (R$) vem ANTES do número, separado por um espaço não separável — oposto à colocação do euro. Padrão da Norma Brasileira ABNT.',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'No Brasil, a ordem padrão em uma linha de endereço de rua é:',
  '[{"label":"Número, depois nome da rua","value":"a"},{"label":"Nome da rua, depois número (ex. « Rua Augusta, 45 »)","value":"b"},{"label":"CEP, depois rua","value":"c"},{"label":"Apenas nome do prédio","value":"d"}]'::jsonb,
  'b',
  E'Endereços brasileiros escrevem o nome da rua primeiro, seguido pelo número, frequentemente separados por vírgula: « Rua Augusta, 45 ». Igual ao espanhol/italiano/alemão.',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em uma agenda comercial brasileira formal, « 3 PM » é mais comumente escrito como:',
  '[{"label":"3:00 PM","value":"a"},{"label":"3 da tarde","value":"b"},{"label":"15:00 / 15h","value":"c"},{"label":"15 horas tarde","value":"d"}]'::jsonb,
  'c',
  E'O Brasil usa tanto o formato 12 horas quanto o de 24 horas na escrita, mas contextos formais/empresariais preferem o formato 24 horas com « h » como separador (« 15h ») ou com dois-pontos (« 15:00 »).',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'No Brasil, qual data é um feriado nacional importante para prazos de projetos de tradução?',
  '[{"label":"7 de setembro — Independência do Brasil","value":"a"},{"label":"4 de julho","value":"b"},{"label":"14 de julho","value":"c"},{"label":"Nenhuma das anteriores","value":"d"}]'::jsonb,
  'a',
  E'7 de setembro (Independência) é um dos principais feriados nacionais brasileiros. Outras datas-chave: 21 de abril (Tiradentes), 1° de maio (Trabalho), 12 de outubro (Nossa Senhora Aparecida), 2 de novembro (Finados), 15 de novembro (Proclamação da República), período do Carnaval (móvel).',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em contextos formais brasileiros, « Senhor »/« Senhora » antes de um nome indica:',
  '[{"label":"Uma forma formal/respeitosa de tratamento","value":"a"},{"label":"Que a pessoa tem credenciais acadêmicas","value":"b"},{"label":"Que a pessoa é casada","value":"c"},{"label":"Que a pessoa é funcionária pública","value":"d"}]'::jsonb,
  'a',
  E'« Senhor »/« Senhora » + nome é o tratamento formal padrão no Brasil. « Dom »/« Dona » existe mas é mais tradicional/regional. « Doutor »/« Doutora » é título de cortesia para qualquer profissional percebido como tal — usado mais livremente que na Itália.',
  'medium', true
),
(
  'cultural_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em um e-mail comercial brasileiro para um executivo sênior desconhecido, o pronome mais apropriado é:',
  '[{"label":"tu","value":"a"},{"label":"você","value":"b"},{"label":"o senhor / a senhora","value":"c"},{"label":"a gente","value":"d"}]'::jsonb,
  'c',
  E'Para contextos muito formais ou hierárquicos no Brasil, « o senhor »/« a senhora » + verbo na 3ª pessoa é usado. « Você » é o padrão para a maioria dos contextos empresariais, mas pode soar informal demais no primeiro contato com alguém sênior. Escolha de registro importante.',
  'medium', true
),

-- DOMAIN — Portuguese (Brazil)
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Um texto comercial fonte usa « best practices ». Qual tradução para o português brasileiro é preferida em contextos institucionais?',
  '[{"label":"melhores práticas","value":"a"},{"label":"boas práticas","value":"b"},{"label":"práticas ótimas","value":"c"},{"label":"As três são aceitáveis; a escolha depende do glossário do cliente","value":"d"}]'::jsonb,
  'd',
  E'« Boas práticas » e « melhores práticas » são amplamente usadas no português brasileiro institucional. « Melhores práticas » é mais comum em contextos corporativos; « boas práticas » em documentos governamentais e da Anvisa/ABNT. Seguir o glossário do cliente quando existe; na ausência, ambas são defensáveis.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'During a translation project, the same source term appears in 50 segments. The translator should:',
  '[{"label":"Translate it differently each time to avoid repetition.","value":"a"},{"label":"Use the same translation throughout, or document a glossary if multiple translations are needed for context-driven reasons.","value":"b"},{"label":"Use synonyms in roughly 50% of occurrences for variety.","value":"c"},{"label":"Leave it untranslated in technical fields.","value":"d"}]'::jsonb,
  'b',
  E'Terminology consistency is a core ISO 17100 §5.3 requirement. Unjustified variation creates ambiguity.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'When translating a Brazilian Portuguese legal document referring to « o Código Civil » into English, the translator should:',
  '[{"label":"Translate as « the Civil Code » with no further qualification.","value":"a"},{"label":"Translate as « the Brazilian Civil Code » or add a translator''s note specifying jurisdiction.","value":"b"},{"label":"Translate as « the Civil Code of Brazil » regardless of context.","value":"c"},{"label":"Leave « Código Civil » untranslated in italics.","value":"d"}]'::jsonb,
  'b',
  E'Multiple Lusophone jurisdictions have civil codes (Brazil, Portugal, Cape Verde, Angola, etc.). Disambiguate with « Brazilian Civil Code » or a translator''s note. Standard practice in legal translation.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'A client provides a Brazilian Portuguese style guide that prefers active voice. The source English contains an unavoidable passive sentence. The translator should:',
  '[{"label":"Always preserve the source structure exactly.","value":"a"},{"label":"Convert to active voice when the meaning is fully preserved and the style guide requires it.","value":"b"},{"label":"Ignore the style guide if it conflicts with literal translation.","value":"c"},{"label":"Ask the client to rewrite the source.","value":"d"}]'::jsonb,
  'b',
  E'Style guide compliance is documented under ISO 17100 §5.3. Active-vs-passive transformation is allowed when meaning is preserved. Brazilian Portuguese has the « se » passive/impersonal construction as a common alternative.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'A source text contains « The patient is 5 feet, 6 inches tall ». For a Brazil target audience medical document, the translator should:',
  '[{"label":"Leave as « 5 pés, 6 polegadas ».","value":"a"},{"label":"Convert to metric: « 1,68 m » (with original in parentheses if regulated documents require traceability).","value":"b"},{"label":"Convert to metric only if the client explicitly specifies.","value":"c"},{"label":"Leave in feet/inches and add a footnote.","value":"d"}]'::jsonb,
  'b',
  E'Brazil uses the metric system. Standard translator practice for non-US target audiences is to convert with the original in parentheses when regulatory or evidentiary traceability matters (e.g. clinical documents subject to Anvisa requirements).',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'A source English sentence is genuinely ambiguous — it has two plausible readings. The translator should:',
  '[{"label":"Pick the most likely reading and translate it.","value":"a"},{"label":"Translate ambiguously to preserve both readings (if Portuguese allows it).","value":"b"},{"label":"Submit a query to the client / project manager to disambiguate.","value":"c"},{"label":"Leave the segment untranslated and add a translator''s note.","value":"d"}]'::jsonb,
  'c',
  E'ISO 17100 §5.3.4 requires translators to raise queries when the source is unclear. Silently disambiguating risks introducing an error the client cannot detect.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  E'Em uma tradução contemporânea de inglês para português brasileiro, o nome próprio « John Smith » (pessoa fictícia viva) deve ser:',
  '[{"label":"Traduzido como « João Ferreiro »","value":"a"},{"label":"Transliterado como « Jon Esmis »","value":"b"},{"label":"Mantido como « John Smith »","value":"c"},{"label":"Traduzido apenas se a fonte explicitamente pedir","value":"d"}]'::jsonb,
  'c',
  E'A prática moderna de tradução em português preserva os nomes próprios de pessoas vivas. A tradução histórica (João Batista para John the Baptist, Cristóvão Colombo para Christopher Columbus) é reservada a figuras religiosas, reais ou históricas canônicas.',
  'medium', true
),
(
  'domain_competence', NULL, '0a8b37d5-1464-4b36-98cc-02efaf31e0be',
  'After completing a translation in a CAT tool, the translator''s mandatory next step before delivery is:',
  '[{"label":"Send to client immediately if the deadline is tight.","value":"a"},{"label":"Run a QA check covering consistency, missing translations, number formatting, and terminology.","value":"b"},{"label":"Re-read once on screen and submit.","value":"c"},{"label":"Ask a colleague to glance at it informally.","value":"d"}]'::jsonb,
  'b',
  E'ISO 17100 §5.3.3 requires a checking step (self-revision) before handover. CAT tool QA features catch missing translations, numeric mismatches, terminology inconsistencies, tag errors automatically.',
  'medium', true
);
