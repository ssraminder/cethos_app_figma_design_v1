-- CRA place-of-supply correction for an Alberta-registered business.
-- Reference: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html
--
-- An Alberta business is GST-only registered (not PST/QST). For services
-- supplied to recipients in:
--   - Non-harmonized provinces (BC/MB/SK/QC + AB + NT/NU/YT): only 5% GST.
--     Provincial PST/QST is collected only by vendors registered in those
--     provinces; we don't collect it.
--   - Harmonized provinces: HST at the recipient's rate
--     (ON 13%, NB/NL/PE 15%, NS 14% effective 2025-04-01).
--   - International recipients: 0% (zero-rated export).
--
-- Previous rows had BC/MB/SK/QC as combined GST+PST/QST which is incorrect
-- for an AB-registered supplier.

UPDATE public.tax_rates SET tax_name = 'GST', rate = 0.0500 WHERE region_code = 'BC';
UPDATE public.tax_rates SET tax_name = 'GST', rate = 0.0500 WHERE region_code = 'MB';
UPDATE public.tax_rates SET tax_name = 'GST', rate = 0.0500 WHERE region_code = 'QC';
UPDATE public.tax_rates SET tax_name = 'GST', rate = 0.0500 WHERE region_code = 'SK';
UPDATE public.tax_rates SET rate = 0.1400 WHERE region_code = 'NS';
