// ============================================================================
// generate-order-instructions v1.0
// Reads all client communications + attachments for an order, asks Claude to
// produce a vendor-ready brief, and stores it as a new is_current row in
// order_ai_instructions. The result is NOT auto-approved — staff must
// review and approve before the vendor portal sees it.
// Date: 2026-04-22
// ============================================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROMPT_KEY = "order_instructions_generation";
const ATTACHMENT_BUCKET = "quote-files";
// Per-attachment cap when sending to Claude (raw bytes downloaded).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { order_id, generated_by } = await req.json();
    if (!order_id) throw new Error("order_id is required");

    // ── 1. Load order + customer + languages ──
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(
        `id, order_number, client_project_number, currency, is_rush,
         estimated_delivery_date, delivery_option,
         customer:customers(id, full_name, email, company_name),
         certification_type:certification_types(id, name)`,
      )
      .eq("id", order_id)
      .single();
    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    // ── 2. Load all communications (chronological) ──
    const { data: comms, error: commsErr } = await supabase
      .from("order_communications")
      .select(
        `id, kind, subject, body, email_date, created_at,
         author:staff_users(full_name),
         attachments:order_communication_attachments(
           id, original_filename, storage_path, mime_type, file_size, tags
         )`,
      )
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });
    if (commsErr) throw new Error(`Communications load failed: ${commsErr.message}`);

    if (!comms || comms.length === 0) {
      throw new Error(
        "No client communications found for this order. Add at least one before generating instructions.",
      );
    }

    // ── 3. Load active prompt ──
    const { data: prompt, error: promptErr } = await supabase
      .from("ai_prompts")
      .select("prompt_text, llm_model, temperature, max_tokens")
      .eq("prompt_key", PROMPT_KEY)
      .eq("is_active", true)
      .single();
    if (promptErr || !prompt) {
      throw new Error(
        `AI prompt '${PROMPT_KEY}' not found or inactive. Configure it in Admin Settings → AI Prompts.`,
      );
    }

    // ── 4. Load prior current instructions (for change-summary diff hint) ──
    const { data: priorRow } = await supabase
      .from("order_ai_instructions")
      .select("id, instructions_text")
      .eq("order_id", order_id)
      .eq("is_current", true)
      .maybeSingle();

    // ── 5. Build the user message: order metadata + communications block ──
    const orderHeader = [
      `# Order ${order.order_number}`,
      order.client_project_number
        ? `Client project number: ${order.client_project_number}`
        : null,
      order.customer?.full_name ? `Client: ${order.customer.full_name}` : null,
      order.customer?.company_name ? `Company: ${order.customer.company_name}` : null,
      order.certification_type?.name
        ? `Certification on order: ${order.certification_type.name}`
        : null,
      order.is_rush ? "Marked as RUSH" : null,
      order.estimated_delivery_date
        ? `Estimated delivery: ${order.estimated_delivery_date}`
        : null,
      order.delivery_option ? `Delivery option: ${order.delivery_option}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const commsBlock = comms
      .map((c, idx) => {
        const when = c.email_date
          ? new Date(c.email_date).toISOString()
          : new Date(c.created_at).toISOString();
        const who =
          c.kind === "client_email"
            ? "Client"
            : c.kind === "phone_summary"
              ? "Phone summary (logged by staff)"
              : "Staff note";
        const author = c.author?.full_name
          ? ` — logged by ${c.author.full_name}`
          : "";
        const attachLine =
          c.attachments && c.attachments.length > 0
            ? `\n_Attachments:_ ${c.attachments
                .map((a: { original_filename: string; tags?: string | null }) =>
                  a.tags
                    ? `${a.original_filename} (tags: ${a.tags})`
                    : a.original_filename,
                )
                .join(", ")}`
            : "";
        const subject = c.subject ? `\n**Subject:** ${c.subject}` : "";
        return `## Communication ${idx + 1} — ${who}${author} — ${when}${subject}\n\n${c.body}${attachLine}`;
      })
      .join("\n\n---\n\n");

    const priorBlock = priorRow?.instructions_text
      ? `\n\n---\n\n## Previously approved instructions (for context — only mention changes if the new communications materially change the brief)\n\n${priorRow.instructions_text}`
      : "";

    const userText = `${orderHeader}\n\n# Client communications (chronological)\n\n${commsBlock}${priorBlock}`;

    // ── 6. Build attachment content blocks ──
    type ContentBlock =
      | { type: "text"; text: string }
      | {
          type: "document";
          source: {
            type: "base64";
            media_type: string;
            data: string;
          };
          title?: string;
        }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        };

    const contentBlocks: ContentBlock[] = [{ type: "text", text: userText }];
    const skippedAttachments: string[] = [];

    const allAttachments = comms.flatMap(
      (c) => (c.attachments || []) as Array<{
        id: string;
        original_filename: string;
        storage_path: string;
        mime_type: string | null;
        file_size: number | null;
        tags: string | null;
      }>,
    );

    for (const att of allAttachments) {
      if (att.file_size && att.file_size > MAX_ATTACHMENT_BYTES) {
        skippedAttachments.push(
          `${att.original_filename} (too large: ${Math.round(att.file_size / 1024 / 1024)}MB)`,
        );
        continue;
      }

      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .download(att.storage_path);

      if (dlErr || !fileBlob) {
        skippedAttachments.push(`${att.original_filename} (download failed)`);
        continue;
      }

      const arrayBuf = await fileBlob.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(arrayBuf));
      const mime = (att.mime_type || "").toLowerCase();
      const tagSuffix = att.tags ? ` (tags: ${att.tags})` : "";
      const titleWithTags = `${att.original_filename}${tagSuffix}`;

      if (mime === "application/pdf") {
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
          title: titleWithTags,
        });
      } else if (mime.startsWith("image/")) {
        // Image content blocks can't carry a title, so prepend a text marker
        // so the model knows what it's looking at.
        if (att.tags) {
          contentBlocks.push({
            type: "text",
            text: `\n\n_(Next image: ${att.original_filename} — tags: ${att.tags})_`,
          });
        }
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mime as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: base64,
          },
        });
      } else if (
        mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime === "application/msword" ||
        att.original_filename.toLowerCase().endsWith(".docx") ||
        att.original_filename.toLowerCase().endsWith(".doc")
      ) {
        // Anthropic's PDF document support also accepts plain-text via the
        // text content block. We extract a best-effort text representation
        // of the .docx (XML inside a zip) and pass it as text. For .doc
        // (old binary format) we fall back to listing the filename only.
        const extracted = att.original_filename.toLowerCase().endsWith(".docx")
          ? await extractDocxText(arrayBuf)
          : null;
        if (extracted) {
          contentBlocks.push({
            type: "text",
            text: `\n\n## Attachment: ${titleWithTags}\n\n${extracted}`,
          });
        } else {
          skippedAttachments.push(
            `${att.original_filename} (could not extract text)`,
          );
        }
      } else if (mime.startsWith("text/")) {
        const text = new TextDecoder().decode(arrayBuf);
        contentBlocks.push({
          type: "text",
          text: `\n\n## Attachment: ${titleWithTags}\n\n${text}`,
        });
      } else {
        skippedAttachments.push(
          `${att.original_filename} (unsupported type: ${mime || "unknown"})`,
        );
      }
    }

    if (skippedAttachments.length > 0) {
      contentBlocks.push({
        type: "text",
        text: `\n\n_Note to assistant: the following attachments were not readable and should be flagged under Open Questions if they look important: ${skippedAttachments.join("; ")}._`,
      });
    }

    // ── 7. Call Anthropic ──
    const anthropicReq = {
      model: prompt.llm_model || "claude-sonnet-4-6",
      max_tokens: prompt.max_tokens || 4000,
      temperature: Number(prompt.temperature ?? 0.2),
      system: prompt.prompt_text,
      messages: [{ role: "user", content: contentBlocks }],
    };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicReq),
    });

    const anthropicJson = await anthropicRes.json();
    if (!anthropicRes.ok) {
      console.error("Anthropic error:", JSON.stringify(anthropicJson));
      throw new Error(
        `Anthropic API error: ${anthropicJson?.error?.message || anthropicRes.statusText}`,
      );
    }

    const instructionsText: string =
      (anthropicJson.content || [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("\n")
        .trim() || "";

    if (!instructionsText) throw new Error("Empty response from Anthropic");

    // ── 8. Generate a 1-line change summary if there was a prior version ──
    let changeSummary: string | null = null;
    if (priorRow?.instructions_text) {
      try {
        const summaryRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: prompt.llm_model || "claude-sonnet-4-6",
            max_tokens: 200,
            temperature: 0.0,
            system:
              "Compare two versions of vendor instructions and produce a single short paragraph (max 3 sentences) describing only what materially changed for the vendor. If nothing of substance changed, write 'Minor wording updates only.' Do not list unchanged sections.",
            messages: [
              {
                role: "user",
                content: `# Previous\n\n${priorRow.instructions_text}\n\n# New\n\n${instructionsText}`,
              },
            ],
          }),
        });
        const summaryJson = await summaryRes.json();
        if (summaryRes.ok) {
          changeSummary =
            (summaryJson.content || [])
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join(" ")
              .trim() || null;
        }
      } catch (e) {
        console.warn("Change-summary generation failed (non-blocking):", e);
      }
    }

    // ── 9. Persist: mark prior current=false, insert new current row ──
    if (priorRow) {
      await supabase
        .from("order_ai_instructions")
        .update({ is_current: false })
        .eq("id", priorRow.id);
    }

    const { data: insertedRow, error: insertErr } = await supabase
      .from("order_ai_instructions")
      .insert({
        order_id,
        instructions_text: instructionsText,
        change_summary: changeSummary,
        model_used: prompt.llm_model || "claude-sonnet-4-6",
        prompt_version: PROMPT_KEY,
        generated_by: generated_by || null,
        is_current: true,
        is_approved: false,
        edited_by_staff: false,
      })
      .select()
      .single();

    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        row: insertedRow,
        skipped_attachments: skippedAttachments,
        usage: anthropicJson.usage || null,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("generate-order-instructions error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Minimal .docx text extraction: a .docx is a zip; the visible text lives in
// word/document.xml inside <w:t> tags. We unzip via the deflate-raw stream
// available in Deno and pull text content out with a regex. Good enough for
// client-supplied notes; we are not trying to preserve formatting.
async function extractDocxText(zipBuf: ArrayBuffer): Promise<string | null> {
  try {
    const bytes = new Uint8Array(zipBuf);
    const documentXml = await readZipEntry(bytes, "word/document.xml");
    if (!documentXml) return null;
    const xml = new TextDecoder().decode(documentXml);
    // Pull <w:t ...>text</w:t> while preserving paragraph breaks at </w:p>.
    const withParaBreaks = xml.replace(/<\/w:p>/g, "\n");
    const matches = withParaBreaks.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const text = matches
      .map((m) => m.replace(/<w:t[^>]*>([^<]*)<\/w:t>/, "$1"))
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text || null;
  } catch (e) {
    console.warn("docx extraction failed:", e);
    return null;
  }
}

// Tiny zip reader that finds a single entry by path and returns the
// uncompressed bytes. Supports the Stored (0) and Deflate (8) methods —
// both covered by .docx.
async function readZipEntry(
  zip: Uint8Array,
  path: string,
): Promise<Uint8Array | null> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // Walk local file headers from the start.
  let offset = 0;
  while (offset < zip.length - 30) {
    const sig = dv.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // not a local file header
    const method = dv.getUint16(offset + 8, true);
    const compressedSize = dv.getUint32(offset + 18, true);
    const uncompressedSize = dv.getUint32(offset + 22, true);
    const nameLen = dv.getUint16(offset + 26, true);
    const extraLen = dv.getUint16(offset + 28, true);
    const nameBytes = zip.subarray(offset + 30, offset + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;

    if (name === path) {
      const data = zip.subarray(dataStart, dataEnd);
      if (method === 0) return data;
      if (method === 8) {
        const stream = new Blob([data])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"));
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const out = new Uint8Array(total);
        let pos = 0;
        for (const c of chunks) {
          out.set(c, pos);
          pos += c.length;
        }
        return out.length > 0
          ? out
          : new Uint8Array(uncompressedSize); // fall back to size-zero
      }
      return null;
    }
    offset = dataEnd;
  }
  return null;
}
