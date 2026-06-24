-- Welocalize 2nd batch — Stage A: 38 jobs (orders) + 38 draft receivables. Atomic.
-- Mirrors admin-create-order (quote 'paid' + direct order + workflow + steps) with NO customer emails.
-- USD, tax 0 (zero-rated export / is_tax_exempt). Source = English (en). Steps unassigned (next phase).
DO $$
DECLARE
  v_staff    uuid := 'a8b2d97e-4832-41d4-9334-4d6a58558154';  -- raminder@cethos.com (active)
  v_customer uuid := 'fcb79ac3-aba6-41b8-9bda-568c1cf5a0ec';
  v_company  uuid := 'fdf3250b-0e7a-43b3-af34-b4d229cd2030';
  v_src      uuid := 'fde091d2-db5f-4e41-a490-7e15efc419e1';  -- English (source)
  r record; v_proj uuid; v_quote uuid; v_qnum text; v_order uuid;
  v_wf uuid; v_tpl uuid; v_tpl_name text; v_nsteps int; v_seq int; v_made int := 0;
BEGIN
  SELECT COALESCE(MAX((split_part(quote_number,'-',3))::int),0) INTO v_seq
    FROM quotes WHERE quote_number LIKE 'QT-2026-%';

  FOR r IN
    SELECT * FROM (VALUES
  (1,'2603_P1307','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','cd23217e-c632-4955-b10b-31cc89da1930'::uuid,2000.00,'PO-1414502','2026-06-01'::date,'Cognitive Debriefing'),
  (2,'2603_P1307','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','cd23217e-c632-4955-b10b-31cc89da1930'::uuid,700.00,'PO-1414502','2026-06-01'::date,'Clinician Review'),
  (3,'2603_P1307','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','30bac8ce-a848-46ba-9001-bbef3b06c1e3'::uuid,2000.00,'PO-1417055','2026-06-01'::date,'Cognitive Debriefing'),
  (4,'2603_P1307','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','30bac8ce-a848-46ba-9001-bbef3b06c1e3'::uuid,700.00,'PO-1417055','2026-06-01'::date,'Clinician Review'),
  (5,'2604_P0891','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','c511cc79-b7a4-49e5-a9b9-f0b9ec336413'::uuid,3800.00,'PO-1414502','2026-06-01'::date,'Cognitive Debriefing'),
  (6,'2604_P0891','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','c511cc79-b7a4-49e5-a9b9-f0b9ec336413'::uuid,1250.00,'PO-1414502','2026-06-01'::date,'Clinician Review'),
  (7,'2603_P1307','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','0629ce5f-b6bb-49e0-96bd-293649e8fc6a'::uuid,2000.00,'PO-1417055','2026-06-03'::date,'Cognitive Debriefing'),
  (8,'2603_P1307','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','0629ce5f-b6bb-49e0-96bd-293649e8fc6a'::uuid,700.00,'PO-1417055','2026-06-03'::date,'Clinician Review'),
  (9,'2604_P0202','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','d99d9548-b560-4448-812d-750f9f760f2c'::uuid,950.00,'PO-1417055','2026-06-02'::date,'Cognitive Debriefing'),
  (10,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','c96ad09a-0ab0-4ca3-b3c6-c94466c74b94'::uuid,950.00,'PO-1418133','2026-06-04'::date,'Cognitive Debriefing'),
  (11,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','c511cc79-b7a4-49e5-a9b9-f0b9ec336413'::uuid,950.00,'PO-1418133','2026-06-04'::date,'Cognitive Debriefing'),
  (12,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','f76c3197-5ee0-4efb-958a-6874b0933779'::uuid,950.00,'PO-1418133','2026-06-04'::date,'Cognitive Debriefing'),
  (13,'2603_P1331','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','32664bcc-e81b-4b06-a266-6421d80d2772'::uuid,1800.00,'PO-1418158','2026-06-10'::date,'Cognitive Debriefing'),
  (14,'2603_P1331','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','a4af36f2-2e52-423d-9e92-be8222ec6d86'::uuid,1800.00,'PO-1418158','2026-06-10'::date,'Cognitive Debriefing'),
  (15,'2603_P1331','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','77b720af-929a-4826-95cc-0c3306a2aa0c'::uuid,1800.00,'PO-1418158','2026-06-10'::date,'Cognitive Debriefing'),
  (16,'2603_P1331','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','32664bcc-e81b-4b06-a266-6421d80d2772'::uuid,850.00,'PO-1418158','2026-06-10'::date,'Clinician Review'),
  (17,'2603_P1331','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','a4af36f2-2e52-423d-9e92-be8222ec6d86'::uuid,850.00,'PO-1418158','2026-06-10'::date,'Clinician Review'),
  (18,'2603_P1331','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','77b720af-929a-4826-95cc-0c3306a2aa0c'::uuid,850.00,'PO-1418158','2026-06-10'::date,'Clinician Review'),
  (19,'2603_P1331','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','356f22f3-d9e0-48a8-b54b-f6e12002887e'::uuid,850.00,'PO-1418158','2026-06-10'::date,'Clinician Review'),
  (20,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','020b6c76-6d49-4d73-a630-3d8da8fa80ed'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (21,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','4dac9901-d438-4621-b031-7e69a8689903'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (22,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','3f020964-31f9-4310-b632-a46fb629231a'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (23,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','339ca11f-fd50-44ea-a5ec-26eb51b88603'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (24,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','32664bcc-e81b-4b06-a266-6421d80d2772'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (25,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','305cc7ce-4b02-4c91-8398-b6819f7faf9c'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (26,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','d2f7b427-4372-4898-92d7-370db75b0f5d'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (27,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','2894d841-034d-4ad3-996a-eb4379b03a19'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (28,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','7eb707b3-f2f9-4fab-ad54-ca80e8e23e6d'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (29,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','356f22f3-d9e0-48a8-b54b-f6e12002887e'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (30,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','77b720af-929a-4826-95cc-0c3306a2aa0c'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (31,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','a4af36f2-2e52-423d-9e92-be8222ec6d86'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (32,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','d99d9548-b560-4448-812d-750f9f760f2c'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (33,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','0a8b37d5-1464-4b36-98cc-02efaf31e0be'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (34,'2605_P0498','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','72c8fcdf-6fe7-4796-98bc-58c4c922418b'::uuid,950.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (35,'2603_P1331','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','305cc7ce-4b02-4c91-8398-b6819f7faf9c'::uuid,1800.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (36,'2603_P1331','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','356f22f3-d9e0-48a8-b54b-f6e12002887e'::uuid,1800.00,'PO-1420602','2026-06-10'::date,'Cognitive Debriefing'),
  (37,'2603_P1331','5fe95296-e334-4689-ba2b-d3efbdeffa13'::uuid,'clinician_review','305cc7ce-4b02-4c91-8398-b6819f7faf9c'::uuid,850.00,'PO-1420602','2026-06-10'::date,'Clinician Review'),
  (38,'2604_P0891','568599b9-e6b4-4be6-9fa9-805df929dcd2'::uuid,'cognitive_debriefing','77b720af-929a-4826-95cc-0c3306a2aa0c'::uuid,3800.00,'PO-1421561','2026-06-11'::date,'Cognitive Debriefing')
    ) AS t(idx, project, svc_id, tpl_code, tgt, revenue, po, deadline, svc_name)
    ORDER BY idx
  LOOP
    SELECT find_or_create_internal_project(v_customer, v_company, r.project, v_staff) INTO v_proj;
    v_seq := v_seq + 1;
    v_qnum := 'QT-2026-' || lpad(v_seq::text, 5, '0');

    INSERT INTO quotes(quote_number, customer_id, status, processing_status, service_id,
        source_language_id, target_language_id, subtotal, tax_rate, tax_amount, total,
        is_manual_quote, created_by_staff_id, entry_point, internal_project_id, currency, paid_at)
      VALUES (v_qnum, v_customer, 'paid', 'quote_ready', r.svc_id,
        v_src, r.tgt, r.revenue, 0, 0, r.revenue,
        true, v_staff, 'admin_direct_order', v_proj, 'USD', now())
      RETURNING id INTO v_quote;

    INSERT INTO orders(quote_id, customer_id, service_id, status, work_status, is_direct_order,
        subtotal, tax_rate, tax_amount, total_amount, amount_paid, balance_due, currency,
        invoicing_branch_id, po_number, client_project_number, internal_project_id,
        estimated_delivery_date, estimated_delivery_at, invoice_status)
      VALUES (v_quote, v_customer, r.svc_id, 'balance_due', 'pending', true,
        r.revenue, 0, 0, r.revenue, 0, r.revenue, 'USD',
        2, r.po, r.project, v_proj,
        r.deadline, r.deadline::timestamptz, 'unbilled')
      RETURNING id INTO v_order;

    SELECT id, name INTO v_tpl, v_tpl_name FROM workflow_templates
      WHERE code = r.tpl_code AND is_active LIMIT 1;
    SELECT count(*) INTO v_nsteps FROM workflow_template_steps WHERE template_id = v_tpl;

    INSERT INTO order_workflows(order_id, template_id, template_code, template_name, status,
        current_step_number, total_steps)
      VALUES (v_order, v_tpl, r.tpl_code, v_tpl_name, 'not_started', 1, v_nsteps)
      RETURNING id INTO v_wf;

    INSERT INTO order_workflow_steps(workflow_id, order_id, step_number, name, actor_type,
        assignment_mode, auto_advance, is_optional, requires_file_upload, instructions, service_id,
        allowed_actor_types, status, vendor_currency, revision_count, source_language, target_language,
        approval_depends_on_step)
      SELECT v_wf, v_order, s.step_number, s.name, s.actor_type,
        COALESCE(s.assignment_mode,'manual'), COALESCE(s.auto_advance,false),
        COALESCE(s.is_optional,false), COALESCE(s.requires_file_upload,false), s.instructions, s.service_id,
        s.allowed_actor_types, 'pending', 'USD', 0, v_src, r.tgt, s.approval_depends_on_step
      FROM workflow_template_steps s WHERE s.template_id = v_tpl ORDER BY s.step_number;

    -- 1 draft receivable per order (= revenue). AFTER trigger recomputes order totals from this.
    INSERT INTO order_receivables(order_id, description, calculation_unit, pricing_mode, quantity, rate,
        line_subtotal, surcharge_total, discount_total, tax_rate, tax_amount, line_total, currency,
        po_number, client_project_number, sort_order, status, created_by_staff_id)
      VALUES (v_order, r.svc_name, 'flat', 'target', 1, r.revenue,
        r.revenue, 0, 0, 0, 0, r.revenue, 'USD',
        r.po, r.project, 0, 'draft', v_staff);

    v_made := v_made + 1;
  END LOOP;

  RAISE NOTICE 'Welocalize batch 2 Stage A: created % orders + receivables', v_made;
END $$;
