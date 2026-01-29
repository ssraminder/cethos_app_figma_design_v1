import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UpdateQuoteRequest {
  quoteId: string;
  staffId: string;
  updateReason: string;
  changes: {
    sourceLanguageId?: string;
    targetLanguageId?: string;
    intendedUseId?: string;
    isRush?: boolean;
    rushFee?: number;
    deliveryOptionId?: string;
    deliveryFee?: number;
    documents?: Array<{
      analysisId: string;
      billablePages?: number;
      translationCost?: number;
      certificationCost?: number;
    }>;
  };
  sendToCustomer: boolean;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body: UpdateQuoteRequest = await req.json();
    const { quoteId, staffId, updateReason, changes, sendToCustomer } = body;

    console.log("🔄 Updating quote:", quoteId);

    // 1. Get current quote state
    const { data: currentQuote, error: fetchError } = await supabase
      .from("quotes")
      .select(
        `
        *,
        customer:customers(
          id,
          full_name,
          email,
          auth_user_id
        )
      `,
      )
      .eq("id", quoteId)
      .single();

    if (fetchError || !currentQuote) {
      throw new Error(`Quote not found: ${quoteId}`);
    }

    console.log(`📸 Current version: ${currentQuote.version || 1}`);

    // 2. Save current version to history
    const { error: versionError } = await supabase
      .from("quote_versions")
      .insert({
        quote_id: quoteId,
        version: currentQuote.version || 1,
        subtotal: currentQuote.subtotal,
        total: currentQuote.total,
        calculated_totals: currentQuote.calculated_totals,
        is_rush: currentQuote.is_rush,
        rush_fee: currentQuote.rush_fee,
        delivery_option_id: currentQuote.delivery_option_id,
        delivery_fee: currentQuote.delivery_fee,
        updated_by: staffId,
        update_reason: updateReason,
      });

    if (versionError) {
      console.error("❌ Failed to save version:", versionError);
      throw new Error("Failed to save quote version");
    }

    console.log("✅ Version saved to history");

    // 3. Build updates object
    const updates: any = {
      updated_by_staff_id: staffId,
      last_updated_at: new Date().toISOString(),
      update_reason: updateReason,
      version: (currentQuote.version || 1) + 1,
    };

    if (changes.sourceLanguageId)
      updates.source_language_id = changes.sourceLanguageId;
    if (changes.targetLanguageId)
      updates.target_language_id = changes.targetLanguageId;
    if (changes.intendedUseId) updates.intended_use_id = changes.intendedUseId;
    if (changes.isRush !== undefined) updates.is_rush = changes.isRush;
    if (changes.rushFee !== undefined) updates.rush_fee = changes.rushFee;
    if (changes.deliveryOptionId)
      updates.delivery_option_id = changes.deliveryOptionId;
    if (changes.deliveryFee !== undefined)
      updates.delivery_fee = changes.deliveryFee;

    // 4. Update quote
    const { error: updateError } = await supabase
      .from("quotes")
      .update(updates)
      .eq("id", quoteId);

    if (updateError) {
      console.error("❌ Failed to update quote:", updateError);
      throw new Error("Failed to update quote");
    }

    console.log(`✅ Quote updated to version ${updates.version}`);

    // 5. Update documents if provided
    if (changes.documents && changes.documents.length > 0) {
      console.log(`📄 Updating ${changes.documents.length} documents`);

      for (const doc of changes.documents) {
        const docUpdates: any = {};
        if (doc.billablePages !== undefined)
          docUpdates.billable_pages = doc.billablePages;
        if (doc.translationCost !== undefined)
          docUpdates.translation_cost = doc.translationCost;
        if (doc.certificationCost !== undefined)
          docUpdates.certification_cost = doc.certificationCost;

        if (Object.keys(docUpdates).length > 0) {
          const { error: docError } = await supabase
            .from("ai_analysis_results")
            .update(docUpdates)
            .eq("id", doc.analysisId);

          if (docError) {
            console.error(
              `❌ Failed to update document ${doc.analysisId}:`,
              docError,
            );
          }
        }
      }
    }

    // 6. Recalculate quote totals
    console.log("💰 Recalculating quote totals");
    const { error: recalcError } = await supabase.rpc(
      "recalculate_quote_totals",
      {
        p_quote_id: quoteId,
      },
    );

    if (recalcError) {
      console.error("❌ Failed to recalculate totals:", recalcError);
    }

    // 7. Get updated quote
    const { data: updatedQuote } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    // 8. Send email to customer if requested
    let magicLink = "";
    let emailSent = false;

    if (sendToCustomer && currentQuote.customer?.email) {
      console.log("📧 Sending email to customer");

      // Generate new magic link
      const magicToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      const { error: linkError } = await supabase
        .from("customer_magic_links")
        .insert({
          customer_id: currentQuote.customer_id,
          token: magicToken,
          expires_at: expiresAt.toISOString(),
          purpose: "quote_payment",
          created_by_staff_id: staffId,
        });

      if (linkError) {
        console.error("❌ Failed to create magic link:", linkError);
      } else {
        magicLink = `${Deno.env.get("PUBLIC_URL") || "https://cethos.com"}/quote/${currentQuote.quote_number}?step=5&token=${magicToken}`;

        // Send email via Brevo
        const brevoApiKey = Deno.env.get("BREVO_API_KEY");
        if (brevoApiKey) {
          try {
            const emailResponse = await fetch(
              "https://api.brevo.com/v3/smtp/email",
              {
                method: "POST",
                headers: {
                  "api-key": brevoApiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  to: [
                    {
                      email: currentQuote.customer.email,
                      name: currentQuote.customer.full_name,
                    },
                  ],
                  subject: `Updated Quote: ${currentQuote.quote_number}`,
                  htmlContent: `
                  <h2>Your Quote Has Been Updated</h2>
                  <p>Hello ${currentQuote.customer.full_name},</p>
                  <p>Your quote <strong>${currentQuote.quote_number}</strong> has been updated.</p>
                  
                  <h3>What Changed:</h3>
                  <p>${updateReason}</p>
                  
                  <h3>Updated Pricing:</h3>
                  <p><strong>Previous Total:</strong> $${currentQuote.total?.toFixed(2) || "0.00"}</p>
                  <p><strong>New Total:</strong> $${updatedQuote?.total?.toFixed(2) || "0.00"}</p>
                  
                  <p>
                    <a href="${magicLink}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                      Review & Pay Now
                    </a>
                  </p>
                  
                  <p>This link is valid for 30 days.</p>
                  
                  <p>Best regards,<br>CETHOS Team</p>
                `,
                }),
              },
            );

            if (emailResponse.ok) {
              console.log("✅ Email sent successfully");
              emailSent = true;
            } else {
              const errorData = await emailResponse.text();
              console.error("❌ Brevo API error:", errorData);
            }
          } catch (emailError) {
            console.error("❌ Failed to send email:", emailError);
          }
        }
      }
    }

    // 9. Log staff activity
    await supabase.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "update_quote",
      entity_type: "quote",
      entity_id: quoteId,
      details: {
        update_reason: updateReason,
        old_version: currentQuote.version || 1,
        new_version: updates.version,
        email_sent: emailSent,
      },
    });

    // 10. Return success
    return new Response(
      JSON.stringify({
        success: true,
        newVersion: updates.version,
        oldTotal: currentQuote.total,
        newTotal: updatedQuote?.total,
        emailSent,
        magicLink: magicLink || undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("❌ Error in update-quote-and-notify:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
