// =============================================================================
// rc-sync-sms — pulls RingCentral SMS message-store into comms.sms_messages.
//
// Captures both Inbound and Outbound SMS so the unified inbox reflects every
// message sent or received via the business number. Outbound messages sent
// through our own rc-send-sms function are deduped by rc_message_id.
//
// Modes:
//   - default: sync since last received message (or last 24h on cold start)
//   - {since: "ISO"}: custom window
//   - {full_resync: true}: re-sync last 30 days
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
} from "../_shared/ringcentral.ts";

const PAGE_SIZE = 250;
const MAX_PAGES_PER_RUN = 10;

interface RcSmsRecord {
  id: number | string;
  type?: string;
  direction?: "Inbound" | "Outbound";
  from?: { phoneNumber?: string; name?: string };
  to?: Array<{ phoneNumber?: string; name?: string }>;
  subject?: string; // SMS body is in subject
  creationTime?: string;
  lastModifiedTime?: string;
  messageStatus?: string;
  conversation?: { id?: string };
  conversationId?: string;
  readStatus?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* empty body ok */ }
    }
    const url = new URL(req.url);
    const fullResync = body.full_resync === true || url.searchParams.get("full_resync") === "true";

    let since: string;
    if (typeof body.since === "string") {
      since = body.since;
    } else if (url.searchParams.get("since")) {
      since = url.searchParams.get("since")!;
    } else if (fullResync) {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // last received_at − 5min overlap, else last 24h
      const { data: threads } = await admin.rpc("comms_list_sms_threads", { p_limit: 1, p_offset: 0 });
      const last = Array.isArray(threads) && threads[0]?.last_message_at;
      since = last
        ? new Date(new Date(last as string).getTime() - 5 * 60 * 1000).toISOString()
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    let page = 1;
    let fetched = 0;
    let inboundUpserted = 0;
    let outboundUpdated = 0;
    let errors = 0;
    const errorSamples: unknown[] = [];

    while (page <= MAX_PAGES_PER_RUN) {
      const resp = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension/~/message-store", {
        method: "GET",
        query: {
          messageType: "SMS",
          dateFrom: since,
          perPage: PAGE_SIZE,
          page,
        },
      });

      if (resp.status !== 200) {
        return jsonResponse(502, { ok: false, step: "message_store", page, status: resp.status, body: resp.body });
      }

      const records = ((resp.body as { records?: RcSmsRecord[] })?.records) ?? [];
      fetched += records.length;

      for (const rec of records) {
        try {
          const fromNumber = rec.from?.phoneNumber ?? null;
          const fromName = rec.from?.name ?? null;
          const firstTo = rec.to?.[0];
          const toNumber = firstTo?.phoneNumber ?? null;
          const toName = firstTo?.name ?? null;
          const bodyText = rec.subject ?? "";
          const rcMessageId = rec.id != null ? String(rec.id) : null;
          const convId = rec.conversation?.id ?? rec.conversationId ?? null;
          const receivedAt = rec.creationTime ?? null;
          const status = rec.messageStatus ?? null;

          if (rec.direction === "Inbound") {
            const { error: rpcErr } = await admin.rpc("comms_upsert_inbound_sms", {
              p_rc_message_id: rcMessageId,
              p_rc_conversation_id: convId,
              p_from_number: fromNumber,
              p_from_name: fromName,
              p_to_number: toNumber,
              p_to_name: toName,
              p_body: bodyText,
              p_received_at: receivedAt,
              p_status: status,
            });
            if (rpcErr) {
              errors++;
              if (errorSamples.length < 3) errorSamples.push({ id: rec.id, err: rpcErr });
            } else {
              inboundUpserted++;
            }
          } else if (rec.direction === "Outbound" && toNumber) {
            const { error: rpcErr } = await admin.rpc("comms_upsert_outbound_sms", {
              p_rc_message_id: rcMessageId,
              p_rc_conversation_id: convId,
              p_from_number: fromNumber ?? cfg.smsFromNumber,
              p_to_number: toNumber,
              p_to_name: toName,
              p_body: bodyText,
              p_sent_at: receivedAt,
              p_status: status === "Sent" || status === "Delivered" ? "sent" : (status === "SendingFailed" ? "failed" : "queued"),
            });
            if (rpcErr) {
              errors++;
              if (errorSamples.length < 3) errorSamples.push({ id: rec.id, err: rpcErr });
            } else {
              outboundUpdated++;
            }
          }
        } catch (e) {
          errors++;
          if (errorSamples.length < 3) errorSamples.push({ id: rec.id, err: String(e) });
        }
      }

      const nav = (resp.body as { navigation?: { nextPage?: { uri?: string } } })?.navigation;
      if (!nav?.nextPage?.uri || records.length < PAGE_SIZE) break;
      page++;
    }

    return jsonResponse(200, {
      ok: true,
      window: { since },
      pagesFetched: page,
      fetched,
      inboundUpserted,
      outboundUpdated,
      errors,
      errorSamples,
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
