-- 20260626_public_quote_auto_pricing.sql
-- Kill-switch that gates AUTOMATIC pricing on the public/customer quote flow once
-- the real OCR + AI analysis pipeline completes.
--
-- Context: process-quote-documents was a placeholder stub (since the 2026-05-31
-- verify_jwt redeploy dropped the real inline OCR pipeline) that priced every
-- public quote at a fabricated 350-word / 1.56-page / $101.40 figure regardless
-- of the actual document. The rewrite drives the real pipeline that the admin
-- "Run OCR" flow already uses. This toggle controls what happens when analysis
-- finishes:
--   false (default) -- hold the quote in 'review_required' so staff send the final
--                      quote. Stops the fabricated-price bleed immediately while a
--                      human stays in the loop and the auto path is observed.
--   true            -- auto-publish the real, analysis-derived price so the
--                      customer can self-checkout (restores the original automated
--                      quote behaviour).
--
-- Default OFF / fail-closed, per the project convention for risky automation:
-- flip to 'true' only after live-verifying the real pipeline on production quotes.

INSERT INTO public.app_settings (setting_key, setting_value, setting_type, description)
VALUES (
  'public_quote_auto_pricing',
  'false',
  'boolean',
  'When true, public/customer quotes auto-publish the real OCR-analysis price for self-checkout once analysis completes. When false (default, fail-closed), completed analyses are held in review_required for staff to send the quote.'
)
ON CONFLICT (setting_key) DO NOTHING;
