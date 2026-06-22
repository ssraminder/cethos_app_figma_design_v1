-- Auto-enrich order-based customer-invoice line descriptions with the service
-- and source > target language pair. The invoice generator (generate-customer-
-- invoice) is a source-less deploy we can't safely edit, so this BEFORE INSERT
-- trigger standardises every new order line regardless of what the generator
-- wrote. Custom (non-order) lines and lines missing language data are untouched.
-- Uses ">" (WinAnsi-safe) rather than "→" so the PDF font can render it.
-- Applied to prod via MCP on 2026-06-20; committed for repo parity.
CREATE OR REPLACE FUNCTION public.enrich_invoice_line_description()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order_number text;
  v_service text;
  v_src text;
  v_tgt text;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW; -- custom line, leave description as-is
  END IF;

  SELECT o.order_number, sv.name, sl.name, tl.name
    INTO v_order_number, v_service, v_src, v_tgt
  FROM public.orders o
  LEFT JOIN public.quotes q  ON q.id  = o.quote_id
  LEFT JOIN public.languages sl ON sl.id = q.source_language_id
  LEFT JOIN public.languages tl ON tl.id = q.target_language_id
  LEFT JOIN public.services  sv ON sv.id = o.service_id
  WHERE o.id = NEW.order_id;

  IF v_order_number IS NOT NULL AND v_src IS NOT NULL AND v_tgt IS NOT NULL THEN
    NEW.description :=
      'Order ' || v_order_number
      || COALESCE(' · ' || v_service, '')
      || ' · ' || v_src || ' > ' || v_tgt
      || COALESCE(' · PO: ' || NULLIF(NEW.po_number, ''), '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrich_invoice_line_description ON public.customer_invoice_lines;
CREATE TRIGGER trg_enrich_invoice_line_description
BEFORE INSERT ON public.customer_invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.enrich_invoice_line_description();
