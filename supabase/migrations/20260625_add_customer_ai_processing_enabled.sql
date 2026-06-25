-- Per-client AI toggle. When false, AI-assisted features (e.g. the auto-generated
-- vendor job-instructions brief) are disabled for that client's orders — used to
-- keep sensitive-domain (COA / IQVIA) work out of AI. Enforced server-side in
-- generate-order-instructions and hidden in the order UI (OrderCommunicationsTab).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS ai_processing_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customers.ai_processing_enabled IS
  'When false, AI-assisted features (e.g. auto-generated vendor job-instructions) are disabled for this client''s orders. Used to keep sensitive-domain (COA / IQVIA) work out of AI. Enforced server-side in generate-order-instructions and hidden in the order UI.';

-- Disable AI for the COA clients per the IQVIA no-AI-on-sensitive-domains attestation.
UPDATE public.customers
   SET ai_processing_enabled = false
 WHERE company_name ILIKE 'weloc%'
    OR company_name ILIKE 'RWS%'
    OR company_name ILIKE 'transperfect%';
