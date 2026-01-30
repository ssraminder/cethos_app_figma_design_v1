-- ============================================================================
-- MIGRATION: Order Cancellations and Email Templates
-- Description: Creates tables for email templates and order cancellations
-- Date: 2026-01-30
-- ============================================================================

-- =====================================================
-- 1. EMAIL TEMPLATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_code TEXT UNIQUE NOT NULL,
  template_name TEXT NOT NULL,
  description TEXT,

  -- Sender configuration
  sender_name TEXT NOT NULL DEFAULT 'CETHOS Translations',
  sender_email TEXT NOT NULL DEFAULT 'noreply@cethos.com',
  reply_to_email TEXT DEFAULT 'support@cethos.com',

  -- Email content
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,

  -- Available variables for this template (for admin reference)
  available_variables TEXT[] DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_email_templates_code ON email_templates(template_code);

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Staff can view email templates" ON email_templates;
CREATE POLICY "Staff can view email templates" ON email_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can update email templates" ON email_templates;
CREATE POLICY "Staff can update email templates" ON email_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access email templates" ON email_templates;
CREATE POLICY "Service role full access email templates" ON email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_templates_updated_at();

-- =====================================================
-- 2. SEED DEFAULT EMAIL TEMPLATES
-- =====================================================

-- Order Cancellation Email Template
INSERT INTO email_templates (
  template_code,
  template_name,
  description,
  sender_name,
  sender_email,
  reply_to_email,
  subject,
  html_content,
  text_content,
  available_variables
) VALUES (
  'order_cancellation',
  'Order Cancellation',
  'Sent to customer when their order is cancelled',
  'CETHOS Translations',
  'noreply@cethos.com',
  'support@cethos.com',
  'Order Cancelled - {{order_number}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .email-wrapper { background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 10px 0 0; opacity: 0.9; font-size: 14px; }
    .content { padding: 30px 25px; }
    .greeting { font-size: 16px; margin-bottom: 20px; }
    .info-box { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-size: 14px; }
    .info-value { font-weight: 600; color: #111827; font-size: 14px; }
    .refund-box { background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
    .refund-title { color: #065f46; font-weight: 600; margin-bottom: 10px; }
    .refund-amount { font-size: 24px; color: #059669; font-weight: 700; }
    .refund-note { color: #047857; font-size: 13px; margin-top: 10px; }
    .message-section { margin: 25px 0; padding: 20px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b; }
    .closing { margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .signature { color: #374151; }
    .signature strong { color: #111827; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb; }
    .footer p { margin: 5px 0; color: #6b7280; font-size: 12px; }
    .footer a { color: #0ea5e9; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="email-wrapper">
      <div class="header">
        <h1>Order Cancellation Notice</h1>
        <p>We''re sorry to see this order go</p>
      </div>

      <div class="content">
        <p class="greeting">Dear {{customer_name}},</p>

        <p>We''re writing to confirm that your order has been cancelled as requested.</p>

        <div class="info-box">
          <div class="info-row">
            <span class="info-label">Order Number</span>
            <span class="info-value">{{order_number}}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Order Total</span>
            <span class="info-value">{{order_total}}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cancellation Reason</span>
            <span class="info-value">{{cancellation_reason}}</span>
          </div>
          {{#if cancellation_notes}}
          <div class="info-row">
            <span class="info-label">Additional Details</span>
            <span class="info-value">{{cancellation_notes}}</span>
          </div>
          {{/if}}
        </div>

        {{#if has_refund}}
        <div class="refund-box">
          <div class="refund-title">Refund Information</div>
          <div class="refund-amount">{{refund_amount}}</div>
          <p class="refund-note">{{refund_message}}</p>
        </div>
        {{/if}}

        <div class="closing">
          <p>If you have any questions about this cancellation or need further assistance, please don''t hesitate to reply to this email or contact our support team.</p>

          <p>We apologize for any inconvenience and hope to serve you again in the future.</p>

          <p class="signature">
            Best regards,<br>
            <strong>{{company_name}}</strong>
          </p>
        </div>
      </div>

      <div class="footer">
        <p><strong>{{company_name}}</strong></p>
        <p>{{company_address}}</p>
        <p>Questions? Contact us at <a href="mailto:{{support_email}}">{{support_email}}</a></p>
      </div>
    </div>
  </div>
</body>
</html>',
  'Dear {{customer_name}},

We''re writing to confirm that your order has been cancelled.

Order Number: {{order_number}}
Order Total: {{order_total}}
Cancellation Reason: {{cancellation_reason}}

{{#if has_refund}}
REFUND INFORMATION
Amount: {{refund_amount}}
{{refund_message}}
{{/if}}

If you have any questions about this cancellation, please reply to this email.

Best regards,
{{company_name}}',
  ARRAY['customer_name', 'customer_email', 'order_number', 'order_total', 'cancellation_reason', 'cancellation_notes', 'has_refund', 'refund_amount', 'refund_method', 'refund_message', 'company_name', 'company_address', 'support_email']
) ON CONFLICT (template_code) DO UPDATE SET
  html_content = EXCLUDED.html_content,
  text_content = EXCLUDED.text_content,
  available_variables = EXCLUDED.available_variables,
  updated_at = NOW();

-- Balance Due Request Email Template
INSERT INTO email_templates (
  template_code,
  template_name,
  description,
  sender_name,
  sender_email,
  reply_to_email,
  subject,
  html_content,
  text_content,
  available_variables
) VALUES (
  'balance_due_request',
  'Balance Due Request',
  'Sent to customer when additional payment is required',
  'CETHOS Translations',
  'noreply@cethos.com',
  'support@cethos.com',
  'Payment Required - {{order_number}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .amount-box { background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #f59e0b; }
    .amount { font-size: 32px; color: #d97706; font-weight: bold; }
    .pay-button { display: inline-block; background: #f59e0b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Payment Required</h1>
    </div>
    <div class="content">
      <p>Dear {{customer_name}},</p>
      <p>There is an outstanding balance on your order that requires payment.</p>

      <div class="amount-box">
        <p style="margin: 0; color: #6b7280;">Balance Due</p>
        <p class="amount">{{balance_due}}</p>
        <p style="margin: 0; color: #6b7280;">Order: {{order_number}}</p>
      </div>

      <p style="text-align: center;">
        <a href="{{payment_link}}" class="pay-button">Pay Now</a>
      </p>

      <p>If you have any questions, please contact us.</p>

      <p>Best regards,<br><strong>{{company_name}}</strong></p>
    </div>
  </div>
</body>
</html>',
  'Dear {{customer_name}},

There is an outstanding balance on your order.

Order: {{order_number}}
Balance Due: {{balance_due}}

Pay now: {{payment_link}}

Best regards,
{{company_name}}',
  ARRAY['customer_name', 'order_number', 'balance_due', 'payment_link', 'company_name', 'support_email']
) ON CONFLICT (template_code) DO UPDATE SET
  html_content = EXCLUDED.html_content,
  text_content = EXCLUDED.text_content,
  available_variables = EXCLUDED.available_variables,
  updated_at = NOW();

-- =====================================================
-- 3. ORDER CANCELLATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS order_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cancelled_by UUID REFERENCES staff_users(id),

  -- Reason
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'customer_request',
    'payment_failed',
    'document_issue',
    'service_unavailable',
    'duplicate_order',
    'fraud_suspected',
    'other'
  )),
  reason_text TEXT NOT NULL,
  additional_notes TEXT,

  -- Refund amount
  refund_type TEXT NOT NULL CHECK (refund_type IN ('full', 'partial', 'none')),
  refund_amount DECIMAL(10,2) DEFAULT 0,

  -- Refund method
  refund_method TEXT CHECK (refund_method IN (
    'stripe',
    'cash',
    'bank_transfer',
    'cheque',
    'e_transfer',
    'store_credit',
    'original_method',
    'other'
  )),

  -- Refund status tracking
  refund_status TEXT DEFAULT 'not_applicable' CHECK (refund_status IN (
    'not_applicable',
    'pending',
    'processing',
    'completed',
    'failed'
  )),
  refund_reference TEXT,
  refund_notes TEXT,
  refund_completed_at TIMESTAMPTZ,
  refund_completed_by UUID REFERENCES staff_users(id),

  -- Stripe specific
  stripe_refund_id TEXT,
  stripe_error TEXT,

  -- Original payment info
  original_payment_method TEXT,
  original_payment_id UUID,

  -- Email notification
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_refund_amount CHECK (refund_amount >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_cancellations_order_id ON order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cancellations_refund_status ON order_cancellations(refund_status);

-- =====================================================
-- 4. ADD COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add cancelled_at to orders if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN cancelled_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add payment_method to payments if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE payments ADD COLUMN payment_method TEXT DEFAULT 'stripe';
  END IF;
END $$;

-- =====================================================
-- 5. RLS FOR ORDER CANCELLATIONS
-- =====================================================

-- Enable RLS on order_cancellations
ALTER TABLE order_cancellations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all cancellations" ON order_cancellations;
CREATE POLICY "Staff can view all cancellations" ON order_cancellations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can insert cancellations" ON order_cancellations;
CREATE POLICY "Staff can insert cancellations" ON order_cancellations
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can update cancellations" ON order_cancellations;
CREATE POLICY "Staff can update cancellations" ON order_cancellations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access cancellations" ON order_cancellations;
CREATE POLICY "Service role full access cancellations" ON order_cancellations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_order_cancellations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_cancellations_updated_at ON order_cancellations;
CREATE TRIGGER order_cancellations_updated_at
  BEFORE UPDATE ON order_cancellations
  FOR EACH ROW
  EXECUTE FUNCTION update_order_cancellations_updated_at();
