-- ============================================================================
-- Order Communications + AI-generated job instructions
-- Date: 2026-04-22
--
-- Lets staff paste raw client emails (with attachments) onto an order, then
-- generate consolidated job instructions via Claude. Generated instructions
-- must be approved before they become visible to vendors. Each approval
-- creates a new active version; previous approved versions are kept as
-- history. Vendor portal reads only is_current AND is_approved rows.
-- ============================================================================

-- ── 1. order_communications: append-only log of client emails / staff notes ──
CREATE TABLE IF NOT EXISTS order_communications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'client_email'
                CHECK (kind IN ('client_email', 'staff_note', 'phone_summary')),
  subject       text,
  body          text NOT NULL,
  email_date    timestamptz,
  created_by    uuid REFERENCES staff_users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_communications_order_id_created_at
  ON order_communications(order_id, created_at DESC);

-- ── 2. order_communication_attachments: files attached to a communication ──
CREATE TABLE IF NOT EXISTS order_communication_attachments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id   uuid NOT NULL REFERENCES order_communications(id) ON DELETE CASCADE,
  original_filename  text NOT NULL,
  storage_path       text NOT NULL,
  mime_type          text,
  file_size          bigint,
  uploaded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_comm_attachments_communication_id
  ON order_communication_attachments(communication_id);

-- ── 3. order_ai_instructions: versioned generated instructions ──
CREATE TABLE IF NOT EXISTS order_ai_instructions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  instructions_text   text NOT NULL,
  change_summary      text,
  model_used          text,
  prompt_version      text,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  generated_by        uuid REFERENCES staff_users(id),
  is_current          boolean NOT NULL DEFAULT true,
  edited_by_staff     boolean NOT NULL DEFAULT false,
  edited_at           timestamptz,
  edited_by           uuid REFERENCES staff_users(id),
  is_approved         boolean NOT NULL DEFAULT false,
  approved_at         timestamptz,
  approved_by         uuid REFERENCES staff_users(id),
  vendor_notified_at  timestamptz
);

-- Only one current row per order.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_order_ai_instructions_current
  ON order_ai_instructions(order_id) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_order_ai_instructions_order_id_generated_at
  ON order_ai_instructions(order_id, generated_at DESC);

-- ── RLS ──
ALTER TABLE order_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_communication_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_ai_instructions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communications' AND policyname='Authenticated read order_communications') THEN
    CREATE POLICY "Authenticated read order_communications" ON order_communications
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communications' AND policyname='Authenticated insert order_communications') THEN
    CREATE POLICY "Authenticated insert order_communications" ON order_communications
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communications' AND policyname='Service role full access on order_communications') THEN
    CREATE POLICY "Service role full access on order_communications" ON order_communications
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communication_attachments' AND policyname='Authenticated read order_comm_attachments') THEN
    CREATE POLICY "Authenticated read order_comm_attachments" ON order_communication_attachments
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communication_attachments' AND policyname='Authenticated insert order_comm_attachments') THEN
    CREATE POLICY "Authenticated insert order_comm_attachments" ON order_communication_attachments
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_communication_attachments' AND policyname='Service role full access on order_comm_attachments') THEN
    CREATE POLICY "Service role full access on order_comm_attachments" ON order_communication_attachments
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_ai_instructions' AND policyname='Authenticated read order_ai_instructions') THEN
    CREATE POLICY "Authenticated read order_ai_instructions" ON order_ai_instructions
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_ai_instructions' AND policyname='Authenticated update order_ai_instructions') THEN
    CREATE POLICY "Authenticated update order_ai_instructions" ON order_ai_instructions
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_ai_instructions' AND policyname='Service role full access on order_ai_instructions') THEN
    CREATE POLICY "Service role full access on order_ai_instructions" ON order_ai_instructions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Seed AI prompt for instruction generation ──
-- The ai_prompts table is already deployed in production but not tracked
-- in any prior migration. Use a NOT EXISTS guard so reruns are safe and
-- existing rows are not overwritten regardless of unique-constraint state.
INSERT INTO ai_prompts (
  prompt_key, prompt_name, prompt_text, llm_provider, llm_model,
  temperature, max_tokens, description, is_active
)
SELECT
  'order_instructions_generation',
  'Order Instructions Generation',
  $PROMPT$You are a senior translation project coordinator at Cethos. Your job is to read all client communications and reference attachments for an order and produce a single, complete, vendor-ready brief.

You will receive:
- Order metadata (order number, client, languages, certification requirements, deadlines)
- Every client email / staff note for this order, in chronological order
- Every attachment the client has sent (text-extracted)

Produce structured instructions in this exact format using Markdown:

## Scope
What needs to be translated. Be specific about document types, page counts if known, and any items that are explicitly excluded.

## Languages
Source -> Target. Include any directionality nuances (e.g., dialect, regional variant).

## Certification & Formatting
Certification level (notarized, certified, standard), formatting requirements (mirror layout, plain text, etc.), and any required stamps/seals.

## Deadlines
Hard deadlines, preferred delivery date, and any rush context.

## Special Instructions
Style guide notes, glossary preferences, named entities (people, places, products) that must match a specific spelling, tone (formal/legal/marketing), and anything else the vendor must respect.

## Open Questions
Anything ambiguous in the client's communications that should be clarified BEFORE the vendor starts work. If everything is clear, write "None."

Rules:
- Do not invent facts. If the client did not specify something, say so under Open Questions rather than guessing.
- Quote the client verbatim when their exact wording matters (names, brand terms, dates).
- If a later email contradicts an earlier one, follow the most recent instruction and note the supersession.
- Keep the brief tight and skimmable. No filler, no restating the question, no sign-off.$PROMPT$,
  'anthropic',
  'claude-sonnet-4-6',
  0.2,
  4000,
  'Generates a consolidated vendor-facing brief from all client communications and attachments on an order.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM ai_prompts WHERE prompt_key = 'order_instructions_generation'
);
