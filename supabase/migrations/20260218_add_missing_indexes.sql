-- Migration: Add missing indexes for slow query optimization
-- Date: 2026-02-18
-- Purpose: Index all foreign keys used in AdminQuoteDetail and AdminOrderDetail
--          to eliminate full table scans on JOIN and WHERE clauses.

-- ============================================================
-- quote_files: filtered by quote_id on every detail page load
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quote_files_quote_id
  ON quote_files (quote_id);

-- ============================================================
-- ai_analysis_results: filtered by quote_id and joined via quote_file_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_analysis_results_quote_id
  ON ai_analysis_results (quote_id);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_results_quote_file_id
  ON ai_analysis_results (quote_file_id);

-- ============================================================
-- orders: looked up by quote_id (converted quote check) and customer_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_quote_id
  ON orders (quote_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON orders (customer_id);

-- ============================================================
-- conversation_messages: filtered by quote_id, order_id, conversation_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversation_messages_quote_id
  ON conversation_messages (quote_id);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_order_id
  ON conversation_messages (order_id);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id
  ON conversation_messages (conversation_id);

-- ============================================================
-- payments: filtered by order_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON payments (order_id);

-- ============================================================
-- adjustments: filtered by order_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_adjustments_order_id
  ON adjustments (order_id);

-- ============================================================
-- order_cancellations: filtered by order_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_order_cancellations_order_id
  ON order_cancellations (order_id);

-- ============================================================
-- document_certifications: filtered by quote_file_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_document_certifications_quote_file_id
  ON document_certifications (quote_file_id);

-- ============================================================
-- quote_pages: filtered by quote_file_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quote_pages_quote_file_id
  ON quote_pages (quote_file_id);

-- ============================================================
-- quote_document_groups: filtered by quote_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quote_document_groups_quote_id
  ON quote_document_groups (quote_id);

-- ============================================================
-- quote_page_group_assignments: filtered by quote_id, group_id, file_id, page_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_qpga_quote_id
  ON quote_page_group_assignments (quote_id);

CREATE INDEX IF NOT EXISTS idx_qpga_group_id
  ON quote_page_group_assignments (group_id);

CREATE INDEX IF NOT EXISTS idx_qpga_file_id
  ON quote_page_group_assignments (file_id);

CREATE INDEX IF NOT EXISTS idx_qpga_page_id
  ON quote_page_group_assignments (page_id);

-- ============================================================
-- ocr_results: filtered by quote_file_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ocr_results_quote_file_id
  ON ocr_results (quote_file_id);

-- ============================================================
-- staff_activity_log: filtered by entity_id for activity log fetch
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_staff_activity_log_entity_id
  ON staff_activity_log (entity_id);

-- ============================================================
-- customer_conversations: filtered by customer_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customer_conversations_customer_id
  ON customer_conversations (customer_id);

-- ============================================================
-- quote_certifications: filtered by quote_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quote_certifications_quote_id
  ON quote_certifications (quote_id);

-- ============================================================
-- hitl_reviews: filtered by quote_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_hitl_reviews_quote_id
  ON hitl_reviews (quote_id);

-- ============================================================
-- ocr_batches: filtered by quote_id (used in fetchQuoteFiles fallback)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ocr_batches_quote_id
  ON ocr_batches (quote_id);
