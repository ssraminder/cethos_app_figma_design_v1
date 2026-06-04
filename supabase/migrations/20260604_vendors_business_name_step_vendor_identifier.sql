-- Agency/LSP support:
--   vendors.business_name      — the trading / legal name of the agency.
--                                vendors.full_name stays the primary contact.
--   step_deliveries.vendor_identifier — what the agency tags each delivery with
--                                (translator name, internal job ref, etc.).
--                                Required at the UI layer for agencies/LSPs;
--                                optional for solo individuals.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS business_name TEXT;

COMMENT ON COLUMN public.vendors.business_name IS
  'Trading / legal business name for agencies and LSPs (vendor_type=agency or contractor_type=business). NULL for individuals. Displayed alongside vendors.full_name on admin views.';

ALTER TABLE public.step_deliveries
  ADD COLUMN IF NOT EXISTS vendor_identifier TEXT;

COMMENT ON COLUMN public.step_deliveries.vendor_identifier IS
  'Vendor-supplied identifier for this delivery — the translator name, internal job code, or PO ref the agency uses to trace the work. UI requires this for agency/business vendors; optional for individuals.';
