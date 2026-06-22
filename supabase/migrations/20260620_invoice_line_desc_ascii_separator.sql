-- Switch the invoice-line description separator from "·" to ASCII "|" so the
-- invoice PDF renders it reliably (">" for direction stays). Supersedes the
-- separator in 20260620_enrich_invoice_line_description_with_language.sql.
-- Applied to prod via MCP on 2026-06-20.
CREATE OR REPLACE FUNCTION public.enrich_invoice_line_description()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order_number text;
  v_service text;
  v_src text;
  v_tgt text;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
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
      || COALESCE(' | ' || v_service, '')
      || ' | ' || v_src || ' > ' || v_tgt
      || COALESCE(' | PO: ' || NULLIF(NEW.po_number, ''), '');
  END IF;

  RETURN NEW;
END;
$$;
