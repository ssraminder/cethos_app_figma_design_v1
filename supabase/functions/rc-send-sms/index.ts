// =============================================================================
// rc-send-sms — send a preset SMS via RingCentral, log to comms.sms_messages.
//
// Body:
//   {
//     template_key: "send_upload_link",
//     to_number: "+15551234567",
//     variables: { first_name: "Alex", staff_first_name: "Jordan" },
//     staff_user_id: "uuid",
//     customer_id: "uuid"   (optional — for auto-link),
//     call_log_id: "uuid"   (optional — to attach to the originating call)
//   }
//
// For templates with generates_upload_token=true, {{upload_url}} resolves to
// `${FRONTEND_URL}/secure-upload` (the customer completes the OTP flow there).
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
  toE164,
} from "../_shared/ringcentral.ts";

interface RequestBody {
  template_key: string;
  to_number: string;
  variables?: Record<string, string>;
  staff_user_id?: string;
  customer_id?: string;
  call_log_id?: string;
  custom_body?: string; // bypass template, send raw text (still logged)
}

function renderTemplate(body: string, vars: Record<string, string>): { rendered: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    if (vars[key] === undefined || vars[key] === null) {
      missing.push(key);
      return `{{${key}}}`;
    }
    return String(vars[key]);
  });
  return { rendered, missing };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    if (!cfg.smsFromNumber) {
      return jsonResponse(503, { ok: false, error: "RC_SMS_FROM_NUMBER not configured" });
    }

    const body: RequestBody = await req.json();
    if (!body.template_key && !body.custom_body) {
      return jsonResponse(400, { ok: false, error: "template_key or custom_body required" });
    }
    if (!body.to_number) {
      return jsonResponse(400, { ok: false, error: "to_number required" });
    }
    const toE = toE164(body.to_number);
    if (!toE) {
      return jsonResponse(400, { ok: false, error: "invalid to_number" });
    }

    let template: {
      id: string; key: string; body: string; variables: string[]; generates_upload_token: boolean;
    } | null = null;
    let smsText = body.custom_body ?? "";

    if (body.template_key) {
      const { data: templates, error: tplErr } = await admin.rpc("comms_list_sms_templates");
      if (tplErr) {
        return jsonResponse(500, { ok: false, step: "template_lookup", error: tplErr.message });
      }
      const found = (templates ?? []).find((t: { key: string }) => t.key === body.template_key);
      if (!found) {
        return jsonResponse(404, { ok: false, error: `template not found: ${body.template_key}` });
      }
      template = found;

      const vars = { ...(body.variables ?? {}) };
      if (template.generates_upload_token && !vars.upload_url) {
        const frontendUrl = (Deno.env.get("FRONTEND_URL") || "https://portal.cethos.com").replace(/\/+$/, "");
        vars.upload_url = `${frontendUrl}/secure-upload`;
      }
      const { rendered, missing } = renderTemplate(template.body, vars);
      if (missing.length > 0) {
        return jsonResponse(400, { ok: false, error: "missing template variables", missing });
      }
      smsText = rendered;
    }

    if (!smsText.trim()) {
      return jsonResponse(400, { ok: false, error: "empty SMS body" });
    }

    // Send via RC SMS API
    const rcResp = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension/~/sms", {
      method: "POST",
      body: {
        from: { phoneNumber: cfg.smsFromNumber },
        to: [{ phoneNumber: toE }],
        text: smsText,
      },
    });

    const ok = rcResp.status >= 200 && rcResp.status < 300;
    const status = ok ? "sent" : "failed";
    const rcBody = rcResp.body as Record<string, unknown> | string | undefined;
    const rcMessageId = ok && rcBody && typeof rcBody === "object" ? (rcBody as { id?: number | string }).id?.toString() : null;
    const errorText = ok ? null : (typeof rcBody === "string" ? rcBody : JSON.stringify(rcBody));

    const { data: logId, error: logErr } = await admin.rpc("comms_log_sms", {
      p_template_id: template?.id ?? null,
      p_template_key: body.template_key ?? null,
      p_to_number: toE,
      p_from_number: cfg.smsFromNumber,
      p_body: smsText,
      p_variables: body.variables ? body.variables : null,
      p_staff_user_id: body.staff_user_id ?? null,
      p_customer_id: body.customer_id ?? null,
      p_call_log_id: body.call_log_id ?? null,
      p_upload_token: null,
      p_rc_message_id: rcMessageId,
      p_status: status,
      p_error: errorText,
    });

    if (logErr) {
      console.error("comms_log_sms_failed", logErr);
    }

    if (!ok) {
      return jsonResponse(502, {
        ok: false,
        step: "rc_send",
        status: rcResp.status,
        body: rcBody,
        sms_message_id: logId ?? null,
      });
    }

    return jsonResponse(200, {
      ok: true,
      sms_message_id: logId,
      rc_message_id: rcMessageId,
      to: toE,
      from: cfg.smsFromNumber,
      body: smsText,
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
