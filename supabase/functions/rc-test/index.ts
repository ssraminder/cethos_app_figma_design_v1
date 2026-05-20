// =============================================================================
// rc-test — smoke test for RingCentral integration
//
// Verifies:
//   1. JWT → access token exchange works
//   2. Granted scopes are sufficient for our use case
//   3. Account / extension list is reachable
//
// Invoked from admin UI (or curl) — returns sanitized status (no tokens).
// =============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import {
  corsHeaders,
  getAdminClient,
  getRcConfig,
  jsonResponse,
  rcRequest,
} from "../_shared/ringcentral.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const cfg = getRcConfig();
    const admin = getAdminClient();

    // 1) Use the JWT-owner's extension as a no-extra-scope-needed probe.
    //    Then read recent call log (Read Call Log scope).
    const me = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension/~", { method: "GET" });
    if (me.status !== 200) {
      return jsonResponse(502, { ok: false, step: "extension_self", status: me.status, body: me.body });
    }
    const myExt = me.body as Record<string, unknown>;

    // 2) Pull a few recent calls (account-wide) — requires Read Call Log
    const calls = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/call-log", {
      method: "GET",
      query: { perPage: 5, view: "Detailed" },
    });
    const callRecords = (calls.body as { records?: unknown[] })?.records ?? [];

    // 3) Try the account-wide extension list (needs Read Accounts) — optional
    const ext = await rcRequest(admin, cfg, "/restapi/v1.0/account/~/extension", {
      method: "GET",
      query: { perPage: 50, status: "Enabled" },
    });
    const extOk = ext.status === 200;
    const records = extOk ? ((ext.body as { records?: unknown[] })?.records ?? []) : [];
    const extSummary = records.slice(0, 200).map((r) => {
      const rec = r as Record<string, unknown>;
      const contact = rec.contact as Record<string, unknown> | undefined;
      return {
        id: rec.id,
        extensionNumber: rec.extensionNumber,
        type: rec.type,
        name: rec.name,
        email: contact?.email,
        status: rec.status,
      };
    });

    // 3) Token cache row sanity-check (returns row without leaking the token)
    const { data: cacheRow } = await admin
      .schema("comms")
      .from("rc_token_cache")
      .select("expires_at, refresh_expires_at, scope, owner_id, updated_at")
      .eq("id", 1)
      .maybeSingle();

    return jsonResponse(200, {
      ok: true,
      server: cfg.serverUrl,
      jwtOwnerExtension: {
        id: myExt.id,
        extensionNumber: myExt.extensionNumber,
        type: myExt.type,
        name: myExt.name,
        status: myExt.status,
      },
      callLog: {
        scopeOk: calls.status === 200,
        sampleCount: callRecords.length,
        firstFew: callRecords.slice(0, 3).map((r) => {
          const rec = r as Record<string, unknown>;
          const from = rec.from as Record<string, unknown> | undefined;
          const to = rec.to as Record<string, unknown> | undefined;
          return {
            id: rec.id,
            direction: rec.direction,
            from: from?.phoneNumber,
            to: to?.phoneNumber,
            startTime: rec.startTime,
            duration: rec.duration,
            result: rec.result,
          };
        }),
      },
      extensions: { scopeOk: extOk, count: records.length, sample: extSummary.slice(0, 5) },
      tokenCache: cacheRow,
      smsFromNumber: cfg.smsFromNumber || "(unset — SMS won't work until RC_SMS_FROM_NUMBER is set)",
    });
  } catch (e) {
    return jsonResponse(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
