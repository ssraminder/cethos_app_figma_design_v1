-- ============================================================================
-- tr.* Phase 1 seeds: config, round_colors, methodology_templates,
-- cert_statement_templates skeleton.
-- ============================================================================

-- Config
insert into tr.config (key, value, description) values
  ('claude_model', '"claude-opus-4-7"',
   'Default Claude model for tr-review calls.'),
  ('claude_max_output_tokens', '8192',
   'Cap on Claude output tokens per call.'),
  ('claude_temperature', '0',
   'Temperature for review calls. 0 = deterministic.'),
  ('context_summarization_token_threshold', '120000',
   'When conversation_turns input tokens exceed this, summarise old turns.'),
  ('pdf_annotation_default_severity_threshold', '"minor"',
   'Findings of this severity or above are written into PDF annotations.'),
  ('open_question_handwriting_confidence_threshold', '0.8',
   'Below this confidence on a handwritten field, raise an open question.'),
  ('marker_extraction_max_pages', '5',
   'For PDFs, only check first/last N pages for the identity marker.')
on conflict (key) do update set
  value = excluded.value, description = excluded.description, updated_at = now();

-- Round colors — from Cethos historical convention (April 21 round used dark
-- orange in document, so Round 8 stays dark orange to not collide with
-- already-applied colours).
insert into tr.round_colors (round, label, color_hex) values
  (1, 'Round 1 — light yellow', '#FFE699'),
  (2, 'Round 2 — light blue',   '#B4C7E7'),
  (3, 'Round 3 — light orange', '#FFD966'),
  (4, 'Round 4 — light purple', '#CC99FF'),
  (5, 'Round 5 — light teal',   '#A9D08E'),
  (6, 'Round 6 — dark green',   '#006100'),
  (7, 'Round 7 — dark brown',   '#833C0C'),
  (8, 'Round 8 — dark orange',  '#E36C09')
on conflict (round) do update set
  label = excluded.label, color_hex = excluded.color_hex;

-- Methodology templates — translation_quality_v1 + qm_certified_v1.
-- Substitution markers: {{locked_decisions}} {{round_color}}
-- {{source_language}} {{target_language}}. Server assembles via
-- tr.build_system_prompt().

insert into tr.methodology_templates
  (code, name, description, system_prompt_template, output_schema_jsonb, version, active)
values
  ('translation_quality_v1',
   'Translation Quality Review (general)',
   'General-purpose translation review across any language pair. Source vs. target pairing required; flags only verifiable errors; no stylistic findings.',
   $TEMPLATE$
You are a senior translation reviewer at Cethos Solutions Inc.
Source language: {{source_language}}. Target language: {{target_language}}.
This review round colour tag: {{round_color}}.

Universal methodology — apply to every finding:
1. Verify file identity via footer/header/marker check BEFORE reviewing content. Never proceed on a file whose identity has not been verified. Report verification results.
2. Pair source and target files explicitly before flagging mismatches. If a finding implies the source omits something the target has, verify in the source first.
3. Full sentences in "current_translation" and "proposed_change" — no ellipsis or truncation.
4. NO purely stylistic comments. Flag only verifiable errors: mistranslation, omission, factual_error, tense_mismatch, font_encoding, formatting, terminology_inconsistency.
5. Distinguish PDF extraction artefacts from real source-file errors. When uncertain, mark "verify in source .docx" rather than confidently flagging.
6. If asked to flag something not verifiable, decline and explain in `items_considered_not_flagged`. Do NOT fabricate.
7. Cross-document consistency findings only fire when BOTH terms are actually visible in the batch — never inferred.
8. Provide `items_considered_not_flagged` at the end of every review with reasons.
9. Every finding MUST include a `confidence` field (high / medium / low).

Locked project decisions in force (authoritative — do not relitigate):
{{locked_decisions}}

Output: emit a single `emit_findings` tool call with the structured schema. Do not produce prose outside the tool call.
$TEMPLATE$,
   '{
     "type": "object",
     "required": ["file_verifications","findings","items_considered_not_flagged"],
     "properties": {
       "file_verifications": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["file_id","expected_marker","actual_marker","verified"],
           "properties": {
             "file_id": {"type": "string"},
             "expected_marker": {"type": ["string","null"]},
             "actual_marker": {"type": ["string","null"]},
             "verified": {"type": "boolean"}
           }
         }
       },
       "findings": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["finding_number","pair_id","file_id","severity","category","confidence","location","source_text","current_translation","proposed_change","rationale","application_mode"],
           "properties": {
             "finding_number": {"type": "integer", "minimum": 1},
             "pair_id": {"type": "string"},
             "file_id": {"type": "string"},
             "severity": {"enum": ["critical","major","minor","info"]},
             "category": {"enum": ["mistranslation","omission","factual_error","tense_mismatch","font_encoding","formatting","terminology_inconsistency","other"]},
             "confidence": {"enum": ["high","medium","low"]},
             "location": {"type": "object"},
             "source_text": {"type": "string"},
             "current_translation": {"type": "string"},
             "proposed_change": {"type": "string"},
             "english_back_translation": {"type": ["string","null"]},
             "rationale": {"type": "string"},
             "cross_file_consistency": {"type": ["object","null"]},
             "application_mode": {"enum": ["tracked_change","comment","highlight","cell_change","pdf_annotation"]},
             "color_hex": {"type": ["string","null"]}
           }
         }
       },
       "items_considered_not_flagged": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["description","reason"],
           "properties": {
             "file_id": {"type": ["string","null"]},
             "description": {"type": "string"},
             "reason": {"type": "string"}
           }
         }
       },
       "overall_flags": {"type": "array", "items": {"type": "string"}}
     }
   }'::jsonb,
   1, true),

  ('qm_certified_v1',
   'Certified Translation QM',
   'Quality-check a certified translation against its source. Adds QM-specific categories (missing_in_target, extra_in_target, critical_field_mismatch, formatting_fidelity, certification_block, non_translatable_handling, handwriting_uncertain).',
   $TEMPLATE$
You are a QM reviewer for certified translations at Cethos Solutions Inc.
Source language: {{source_language}}. Target language: {{target_language}}.

QM methodology — apply to every job:
1. Completeness: every element of the source (names, dates, numbers, addresses, seals, signatures, stamps, marginalia, footers) must be represented in the target.
2. Fidelity: every element of the target must map to something in the source. Nothing in target should be absent from source.
3. Critical field accuracy: names, dates of birth, document numbers, official numbers (license/passport/ID), addresses, amounts — must match EXACTLY.
4. Formatting fidelity: tables, layout, structural elements preserved as appropriate.
5. Translator certification statement present and correctly worded for the target authority.
6. Non-translatable elements correctly handled ([SEAL], [SIGNATURE], etc.).
7. Handwriting on the source PDF: if confidence in reading a handwritten field is below threshold, emit a finding with category `handwriting_uncertain` and at least 2 `candidate_readings` in the `location` object — DO NOT guess. The job will pause for customer clarification.
8. Same universal rules apply: full sentences, no fabrication, structured output, items_considered_not_flagged required, confidence required.

Locked project decisions in force:
{{locked_decisions}}

Output: emit a single `emit_findings` tool call with the QM-extended schema.
$TEMPLATE$,
   '{
     "type": "object",
     "required": ["file_verifications","findings","items_considered_not_flagged"],
     "properties": {
       "file_verifications": {"type": "array"},
       "findings": {
         "type": "array",
         "items": {
           "type": "object",
           "required": ["finding_number","pair_id","file_id","severity","category","confidence","location","rationale","application_mode"],
           "properties": {
             "finding_number": {"type": "integer", "minimum": 1},
             "pair_id": {"type": "string"},
             "file_id": {"type": "string"},
             "severity": {"enum": ["critical","major","minor","info"]},
             "category": {"enum": ["mistranslation","omission","factual_error","tense_mismatch","formatting","terminology_inconsistency","certification_block","missing_in_target","extra_in_target","critical_field_mismatch","formatting_fidelity","non_translatable_handling","handwriting_uncertain","other"]},
             "confidence": {"enum": ["high","medium","low"]},
             "location": {"type": "object"},
             "source_text": {"type": ["string","null"]},
             "current_translation": {"type": ["string","null"]},
             "proposed_change": {"type": ["string","null"]},
             "rationale": {"type": "string"},
             "application_mode": {"enum": ["tracked_change","comment","highlight","cell_change","pdf_annotation"]}
           }
         }
       },
       "items_considered_not_flagged": {"type": "array"}
     }
   }'::jsonb,
   1, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  system_prompt_template = excluded.system_prompt_template,
  output_schema_jsonb = excluded.output_schema_jsonb,
  version = excluded.version,
  active = excluded.active,
  updated_at = now();

-- Cert statement templates (skeleton — Phase 3 wires them in)
insert into tr.cert_statement_templates (target_authority, cert_type, template, version, active)
values
  ('generic', 'internal_qa',
$$Cethos Solutions Inc. — Internal QA Certification

This translation (Cethos Job ID {{job_id}}) has been reviewed under our quality management system in accordance with ISO 17100:2015 §5.3.

Source language: {{source_language}}    Target language: {{target_language}}
QM reviewer: {{qm_reviewer}}
Date: {{cert_date}}
$$,
   1, true),

  ('uscis', 'regulated',
$$CERTIFICATE OF TRANSLATION (USCIS)

I, {{translator_name}}, certify that I am competent to translate from {{source_language}} into {{target_language}} and that the foregoing is, to the best of my knowledge and ability, a true and accurate translation of the attached document titled "{{document_title}}" dated {{source_document_date}}.

This translation was prepared and reviewed under the quality management system of Cethos Solutions Inc. (Job ID {{job_id}}), in accordance with ISO 17100:2015 §5.3.

________________________________   Date: {{cert_date}}
{{translator_name}}, Translator

________________________________   Date: {{cert_date}}
{{qm_reviewer}}, QM Reviewer
Cethos Solutions Inc.
$$,
   1, true)
on conflict (target_authority, cert_type, version) do update set
  template = excluded.template,
  active = excluded.active,
  updated_at = now();
