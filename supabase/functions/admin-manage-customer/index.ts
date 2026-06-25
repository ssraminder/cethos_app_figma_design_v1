// supabase/functions/admin-manage-customer/index.ts
//
// Customer-side admin facade. Reconstructed after the deployed bundle was
// lost server-side. Same { action, ...params } dispatcher shape the
// portal's CustomerDetail + CreateInvoice pages already call:
//
//   - get { customer_id }
//       Returns the customer row enriched with invoicing_branch and
//       preferred/backup payment_method objects, plus invoice_ready /
//       invoice_missing for the AR-setup banner.
//   - update { customer_id, ...changes }
//       Allowlisted partial update on customers. Sets updated_at.
//   - list_branches
//       Active branches. Used in the Invoicing-branch dropdown.
//   - list_payment_methods
//       Active payment methods (sorted). Used in preferred/backup pickers.
//   - list_customer_types
//       Hard-coded enum (matches the customers.customer_type CHECK
//       constraint: individual | business | legal).
//   - check_invoice_readiness { customer_id }
//       Returns { ready, missing[] } where missing is a list of
//       human-readable AR fields that still need to be set before the
//       customer can be invoiced.
//   - get_unbilled_orders { customer_id, date_from?, date_to?, po_number? }
//       Orders for the customer that have not yet been linked to an
//       issued invoice. Returns selectable flag per row + aggregate counts.
//       Drives the bulk-invoice picker on AdminInvoiceCreate.
//
// Auth: verify_jwt = true. Staff session attached via portal client.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CUSTOMER_TYPE_OPTIONS = [
  { value: "individual", label: "Individual",  group: "Retail" },
  { value: "business",   label: "Business",    group: "B2B" },
  { value: "legal",      label: "Legal / Govt", group: "B2B" },
];

const UPDATABLE_FIELDS = new Set([
  "full_name", "email", "phone", "customer_type", "company_name",
  "billing_address_line1", "billing_address_line2", "billing_city",
  "billing_state", "billing_postal_code", "billing_country",
  "invoicing_branch_id", "tax_number", "preferred_payment_method_id",
  "backup_payment_method_id", "preferred_currency", "payment_terms",
  "is_ar_customer", "ar_contact_email", "accounting_contact_name",
  "accounting_contact_phone", "credit_limit", "ar_notes",
  "auto_invoice_reminders_enabled",
  "requires_po", "requires_po_mode", "requires_client_project_number",
  "default_tax_rate_id",
  "is_tax_exempt",
  "ai_processing_enabled",
]);

function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface ReadinessCheck {
  ready: boolean;
  missing: string[];
}

function computeReadiness(c: any): ReadinessCheck {
  const missing: string[] = [];
  if (!c.invoicing_branch_id) missing.push("Invoicing branch");
  if (!c.preferred_currency) missing.push("Preferred currency");
  if (!c.payment_terms) missing.push("Payment terms");
  if (c.is_ar_customer) {
    if (!c.ar_contact_email) missing.push("AR contact email");
  }
  return { ready: missing.length === 0, missing };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Missing Supabase configuration" },
      500,
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { action } = body || {};

  try {
    switch (action) {
      case "list_customer_types": {
        return jsonResponse({ customer_types: CUSTOMER_TYPE_OPTIONS });
      }

      case "list_branches": {
        const { data, error } = await sb
          .from("branches")
          .select("id, code, legal_name, division, is_default, is_active")
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("legal_name");
        if (error) throw error;
        return jsonResponse({ branches: data || [] });
      }

      case "list_payment_methods": {
        const { data, error } = await sb
          .from("payment_methods")
          .select("id, code, name, is_online, requires_staff_confirmation, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("name");
        if (error) throw error;
        return jsonResponse({ payment_methods: data || [] });
      }

      case "get": {
        const customerId = body.customer_id;
        if (!customerId) {
          return jsonResponse({ error: "customer_id required" }, 400);
        }
        const { data: cust, error } = await sb
          .from("customers")
          .select("*")
          .eq("id", customerId)
          .maybeSingle();
        if (error) throw error;
        if (!cust) return jsonResponse({ error: "Customer not found" }, 404);

        // Enrich with related rows the UI expects.
        let invoicing_branch: any = null;
        if (cust.invoicing_branch_id) {
          const { data: br } = await sb
            .from("branches")
            .select("id, code, legal_name, division, is_default")
            .eq("id", cust.invoicing_branch_id)
            .maybeSingle();
          invoicing_branch = br ?? null;
        }
        let preferred_payment_method: any = null;
        if (cust.preferred_payment_method_id) {
          const { data: pm } = await sb
            .from("payment_methods")
            .select("id, code, name, is_online")
            .eq("id", cust.preferred_payment_method_id)
            .maybeSingle();
          preferred_payment_method = pm ?? null;
        }
        let backup_payment_method: any = null;
        if (cust.backup_payment_method_id) {
          const { data: pm } = await sb
            .from("payment_methods")
            .select("id, code, name, is_online")
            .eq("id", cust.backup_payment_method_id)
            .maybeSingle();
          backup_payment_method = pm ?? null;
        }
        let default_tax_rate: any = null;
        if (cust.default_tax_rate_id) {
          const { data: tr } = await sb
            .from("tax_rates")
            .select("id, tax_name, region_code, region_name, rate, is_active")
            .eq("id", cust.default_tax_rate_id)
            .maybeSingle();
          default_tax_rate = tr ?? null;
        }
        const readiness = computeReadiness(cust);

        return jsonResponse({
          customer: {
            ...cust,
            invoicing_branch,
            preferred_payment_method,
            backup_payment_method,
            default_tax_rate,
            invoice_ready: readiness.ready,
            invoice_missing: readiness.missing,
          },
        });
      }

      case "update": {
        const customerId = body.customer_id;
        if (!customerId) {
          return jsonResponse({ error: "customer_id required" }, 400);
        }
        const changes: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body)) {
          if (k === "action" || k === "customer_id") continue;
          if (UPDATABLE_FIELDS.has(k)) changes[k] = v;
        }
        if (Object.keys(changes).length === 0) {
          return jsonResponse({ error: "No valid fields to update" }, 400);
        }
        changes.updated_at = new Date().toISOString();

        const { data: updated, error } = await sb
          .from("customers")
          .update(changes)
          .eq("id", customerId)
          .select("*")
          .single();
        if (error) throw error;
        return jsonResponse({ customer: updated });
      }

      case "check_invoice_readiness": {
        const customerId = body.customer_id;
        if (!customerId) {
          return jsonResponse({ error: "customer_id required" }, 400);
        }
        const { data: cust, error } = await sb
          .from("customers")
          .select("invoicing_branch_id, preferred_currency, payment_terms, is_ar_customer, ar_contact_email")
          .eq("id", customerId)
          .maybeSingle();
        if (error) throw error;
        if (!cust) return jsonResponse({ error: "Customer not found" }, 404);
        return jsonResponse(computeReadiness(cust));
      }

      case "get_unbilled_orders": {
        const customerId = body.customer_id;
        if (!customerId) {
          return jsonResponse({ error: "customer_id required" }, 400);
        }
        // "Unbilled" = order has no issued (non-void) invoice yet.
        // Pull all orders for the customer, then exclude ids that show up
        // in customer_invoices with status != 'void'. Filter optionally
        // by date range and PO.
        let query = sb
          .from("orders")
          .select(
            "id, order_number, status, work_status, total_amount, balance_due, currency, po_number, client_project_number, created_at, estimated_delivery_date",
          )
          .eq("customer_id", customerId);

        if (body.date_from) query = query.gte("created_at", body.date_from);
        if (body.date_to) query = query.lte("created_at", body.date_to);
        if (body.po_number) query = query.ilike("po_number", `%${body.po_number}%`);

        const { data: ordRows, error: ordErr } = await query.order("created_at", {
          ascending: false,
        });
        if (ordErr) throw ordErr;

        const orderIds = (ordRows || []).map((o: any) => o.id);
        let invoicedSet = new Set<string>();
        if (orderIds.length > 0) {
          const { data: invRows } = await sb
            .from("customer_invoices")
            .select("order_id")
            .neq("status", "void")
            .in("order_id", orderIds);
          invoicedSet = new Set((invRows || []).map((r: any) => r.order_id));
        }

        // Customer's invoicing requirements drive the selectable flag.
        const { data: cust } = await sb
          .from("customers")
          .select("requires_po, requires_client_project_number")
          .eq("id", customerId)
          .maybeSingle();
        const requiresPo = cust?.requires_po === true;
        const requiresProj = cust?.requires_client_project_number === true;

        const enriched = (ordRows || []).map((o: any) => {
          const alreadyInvoiced = invoicedSet.has(o.id);
          const missing: string[] = [];
          if (alreadyInvoiced) missing.push("Already invoiced");
          if (requiresPo && !o.po_number) missing.push("PO number");
          if (requiresProj && !o.client_project_number) missing.push("Client project number");
          if (Number(o.balance_due || 0) <= 0) missing.push("Zero balance");
          return {
            ...o,
            already_invoiced: alreadyInvoiced,
            selectable: missing.length === 0,
            missing,
          };
        });

        const selectableCount = enriched.filter((o: any) => o.selectable).length;
        return jsonResponse({
          orders: enriched,
          total_count: enriched.length,
          selectable_count: selectableCount,
          requires_po: requiresPo,
          requires_client_project_number: requiresProj,
        });
      }

      default:
        return jsonResponse(
          { error: `Unknown action: ${action || "(none)"}` },
          400,
        );
    }
  } catch (err: any) {
    console.error("admin-manage-customer error:", err?.message || err);
    return jsonResponse({ error: err?.message || "Internal error" }, 500);
  }
});
