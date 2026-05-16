-- =====================================================================
-- Audit finding C-4 (NEW, surfaced during H-12 verification): stop-the-bleed.
--
-- `quotes_select_own`, `quotes_update_own`, `quote_files_select`,
-- `quote_files_update`, `quote_files_delete` policies all had
-- `OR (recovery_token IS NOT NULL)` in their qual. Intent was
-- "let a customer recover their quote via an emailed token"; bug
-- was that the policy never verified the caller HAS the matching
-- token — it just checked the row HAS one. Result: anon could read
-- and modify every quote + quote_file whose row ever got assigned
-- a recovery_token.
--
-- Drop the OR clause. Authenticated customers still see their own
-- rows via the `customer_id = (their customer row).id` half. Anon
-- gets nothing. The quote-recovery email flow is broken by this
-- migration until a proper `recover-quote-by-token` edge function
-- ships — acknowledged trade-off in favor of closing the leak now.
--
-- Verified via anon REST probe after applying the migration:
--   /rest/v1/quotes?select=quote_number,total            → []
--   /rest/v1/quote_files?select=id                       → []
--   /rest/v1/v_quote_summary?select=quote_number,total   → []
-- =====================================================================

-- quotes
DROP POLICY IF EXISTS "quotes_select_own" ON public.quotes;
CREATE POLICY "quotes_select_own" ON public.quotes
  FOR SELECT TO public
  USING (
    customer_id IN (
      SELECT customers.id FROM customers
      WHERE customers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "quotes_update_own" ON public.quotes;
CREATE POLICY "quotes_update_own" ON public.quotes
  FOR UPDATE TO public
  USING (
    customer_id IN (
      SELECT customers.id FROM customers
      WHERE customers.auth_user_id = auth.uid()
    )
  );

-- quote_files
DROP POLICY IF EXISTS "quote_files_select" ON public.quote_files;
CREATE POLICY "quote_files_select" ON public.quote_files
  FOR SELECT TO public
  USING (
    quote_id IN (
      SELECT quotes.id FROM quotes
      WHERE quotes.customer_id IN (
        SELECT customers.id FROM customers
        WHERE customers.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "quote_files_update" ON public.quote_files;
CREATE POLICY "quote_files_update" ON public.quote_files
  FOR UPDATE TO public
  USING (
    quote_id IN (
      SELECT quotes.id FROM quotes
      WHERE quotes.customer_id IN (
        SELECT customers.id FROM customers
        WHERE customers.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "quote_files_delete" ON public.quote_files;
CREATE POLICY "quote_files_delete" ON public.quote_files
  FOR DELETE TO public
  USING (
    quote_id IN (
      SELECT quotes.id FROM quotes
      WHERE quotes.customer_id IN (
        SELECT customers.id FROM customers
        WHERE customers.auth_user_id = auth.uid()
      )
    )
  );
