-- ISO 17100 § 3.1.4 + § 4 documentary evidence categories.
-- Idempotent inserts on slug conflict.

INSERT INTO file_categories (name, slug, description, is_billable, display_order, is_active) VALUES
  ('Translation/linguistics degree', 'degree_translation_studies', 'Diploma + transcript for ISO 17100 route (a) — recognized higher-ed in translation, linguistics, or language studies', false, 20, true),
  ('Other-field degree', 'degree_other_field', 'Diploma + transcript for ISO 17100 route (b) — recognized higher-ed in any field (paired with 2y experience)', false, 21, true),
  ('Academic transcript', 'degree_transcript', 'Transcript supporting a degree submission', false, 22, true),
  ('Professional translation certificate', 'professional_translation_cert', 'ATA / CTTIC / ITI / NAATI / other recognized professional certification', false, 23, true),
  ('Experience evidence (2y / 5y)', 'experience_evidence', 'Reference letters, contracts, or POs proving the years of translation experience required by ISO 17100 route (b) or (c)', false, 24, true),
  ('Reference letter', 'reference_letter', 'Individual professional reference (≥ 2 recommended for ISO file)', false, 25, true),
  ('Language proficiency proof', 'language_proficiency', 'C2 / CEFR proof or native-language attestation, especially for non-native target work', false, 26, true),
  ('Subject specialization evidence', 'subject_specialization_proof', 'Per-domain proof: medical/legal/technical degree, professional certification, or portfolio with reference', false, 27, true),
  ('Sworn / certified translator accreditation', 'sworn_translator_accreditation', 'Official accreditation as sworn / certified / public translator', false, 28, true),
  ('Business registration / tax certificate', 'business_registration', 'Business or sole-trader registration; required for invoicing in most jurisdictions', false, 29, true),
  ('E&O insurance certificate', 'insurance_certificate', 'Professional indemnity / errors & omissions insurance certificate', false, 30, true),
  ('CPD record', 'cpd_certificate', 'Continuing professional development certificate', false, 31, true),
  ('Signed NDA (manual upload)', 'nda_signed_pdf', 'Manually signed NDA PDF — only when the vendor cannot use the in-portal clickwrap', false, 32, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = true;
