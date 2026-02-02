import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CorrectionRequest {
  reviewId?: string;
  quoteId?: string;
  staffId: string;
  field: string;
  originalValue?: string;
  correctedValue: string;
  fileId?: string;
  analysisId?: string;
  pageId?: string;
  groupId?: string;
  reason?: string;
  submitToKnowledgeBase?: boolean;
  knowledgeBaseComment?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CorrectionRequest = await req.json();
    const {
      reviewId,
      quoteId,
      staffId,
      field,
      originalValue,
      correctedValue,
      fileId,
      analysisId,
      pageId,
      groupId,
      reason,
      submitToKnowledgeBase,
      knowledgeBaseComment,
    } = body;

    if (!staffId || !field) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: staffId, field",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get quote_id from review if not directly provided
    let resolvedQuoteId = quoteId;
    if (!resolvedQuoteId && reviewId) {
      const { data: review } = await supabaseAdmin
        .from("hitl_reviews")
        .select("quote_id")
        .eq("id", reviewId)
        .single();
      resolvedQuoteId = review?.quote_id;
    }

    console.log(`📝 [SAVE-CORRECTION] Processing field: ${field}`);
    console.log(`  - staffId: ${staffId}`);
    console.log(`  - quoteId: ${resolvedQuoteId}`);
    console.log(`  - correctedValue: ${correctedValue}`);

    // Handle different field types
    switch (field) {
      // ============================================
      // DOCUMENT GROUP OPERATIONS
      // ============================================

      case "assign_item_to_group": {
        // Assign a file or page to a document group
        const data = JSON.parse(correctedValue);
        const { groupId: targetGroupId, itemType, itemId, wordCountOverride } = data;

        const { data: assignmentId, error } = await supabaseAdmin.rpc(
          "assign_item_to_group",
          {
            p_group_id: targetGroupId,
            p_item_type: itemType,
            p_item_id: itemId,
            p_staff_id: staffId,
            p_word_count_override: wordCountOverride || null,
          }
        );

        if (error) throw error;

        console.log(`✅ [SAVE-CORRECTION] Assigned ${itemType} ${itemId} to group ${targetGroupId}`);

        return new Response(
          JSON.stringify({
            success: true,
            assignmentId,
            message: `Item assigned to group successfully`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "unassign_item_from_group": {
        // Remove an item from a document group
        const data = JSON.parse(correctedValue);
        const { assignmentId: targetAssignmentId } = data;

        const { error } = await supabaseAdmin.rpc("unassign_item_from_group", {
          p_assignment_id: targetAssignmentId,
        });

        if (error) throw error;

        console.log(`✅ [SAVE-CORRECTION] Unassigned item ${targetAssignmentId}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Item removed from group successfully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "create_group": {
        // Create a new document group
        const data = JSON.parse(correctedValue);
        const { label, documentType, complexity } = data;

        const { data: newGroupId, error } = await supabaseAdmin.rpc(
          "create_document_group",
          {
            p_quote_id: resolvedQuoteId,
            p_group_label: label,
            p_document_type: documentType,
            p_complexity: complexity || "easy",
            p_staff_id: staffId,
          }
        );

        if (error) throw error;

        console.log(`✅ [SAVE-CORRECTION] Created new group: ${newGroupId}`);

        return new Response(
          JSON.stringify({
            success: true,
            groupId: newGroupId,
            message: "Document group created successfully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "update_group": {
        // Update document group properties
        const data = JSON.parse(correctedValue);
        const { groupId: targetGroupId, label, documentType, complexity, certificationTypeId } = data;

        const { error } = await supabaseAdmin.rpc("update_document_group", {
          p_group_id: targetGroupId,
          p_group_label: label || null,
          p_document_type: documentType || null,
          p_complexity: complexity || null,
          p_certification_type_id: certificationTypeId || null,
        });

        if (error) throw error;

        console.log(`✅ [SAVE-CORRECTION] Updated group: ${targetGroupId}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Document group updated successfully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "delete_group": {
        // Delete a document group
        const data = JSON.parse(correctedValue);
        const { groupId: targetGroupId } = data;

        const { error } = await supabaseAdmin.rpc("delete_document_group", {
          p_group_id: targetGroupId,
        });

        if (error) throw error;

        console.log(`✅ [SAVE-CORRECTION] Deleted group: ${targetGroupId}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Document group deleted successfully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ============================================
      // ANALYSIS FIELD CORRECTIONS
      // ============================================

      case "word_count":
      case "detected_language":
      case "detected_document_type":
      case "assessed_complexity":
      case "page_count":
      case "billable_pages":
      case "line_total":
      case "complexity_multiplier":
      case "certification_type_id":
      case "certification_price": {
        // Update analysis result
        const updateData: Record<string, any> = {
          [field]: correctedValue,
          updated_at: new Date().toISOString(),
        };

        // Handle numeric fields
        if (["word_count", "page_count", "certification_price", "line_total", "billable_pages"].includes(field)) {
          updateData[field] = parseFloat(correctedValue);
        }
        if (field === "complexity_multiplier") {
          updateData[field] = parseFloat(correctedValue);
        }

        // Determine which record to update
        let updateQuery;
        if (analysisId) {
          updateQuery = supabaseAdmin
            .from("ai_analysis_results")
            .update(updateData)
            .eq("id", analysisId);
        } else if (fileId) {
          updateQuery = supabaseAdmin
            .from("ai_analysis_results")
            .update(updateData)
            .eq("quote_file_id", fileId);
        } else {
          throw new Error("Missing analysisId or fileId for analysis correction");
        }

        const { error: updateError } = await updateQuery;
        if (updateError) throw updateError;

        // Log the correction
        if (resolvedQuoteId) {
          const { error: correctionError } = await supabaseAdmin
            .from("staff_corrections")
            .insert({
              quote_id: resolvedQuoteId,
              analysis_id: analysisId,
              field_name: field,
              ai_value: originalValue,
              corrected_value: correctedValue,
              correction_reason: reason,
              submit_to_knowledge_base: submitToKnowledgeBase || false,
              knowledge_base_comment: knowledgeBaseComment,
              created_by_staff_id: staffId,
            });

          if (correctionError) {
            console.error("Failed to log correction:", correctionError);
            // Don't fail the operation
          }

          // Recalculate quote totals
          await supabaseAdmin.rpc("recalculate_quote_totals", {
            p_quote_id: resolvedQuoteId,
          });
        }

        console.log(`✅ [SAVE-CORRECTION] Updated ${field} to ${correctedValue}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: `${field} updated successfully`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ============================================
      // GROUP-LEVEL FIELD CORRECTIONS
      // ============================================

      case "group_complexity":
      case "group_document_type":
      case "group_label":
      case "group_certification_type_id": {
        if (!groupId) {
          throw new Error("Missing groupId for group field correction");
        }

        const fieldMap: Record<string, string> = {
          group_complexity: "complexity",
          group_document_type: "document_type",
          group_label: "group_label",
          group_certification_type_id: "certification_type_id",
        };

        const dbField = fieldMap[field];
        const updateData: Record<string, any> = {
          [dbField]: correctedValue,
          updated_at: new Date().toISOString(),
        };

        // Handle complexity multiplier
        if (field === "group_complexity") {
          const multiplierMap: Record<string, number> = {
            easy: 1.0,
            medium: 1.15,
            hard: 1.25,
          };
          updateData.complexity_multiplier = multiplierMap[correctedValue] || 1.0;
        }

        // Handle certification price
        if (field === "group_certification_type_id" && correctedValue) {
          const { data: certType } = await supabaseAdmin
            .from("certification_types")
            .select("price")
            .eq("id", correctedValue)
            .single();
          if (certType) {
            updateData.certification_price = certType.price;
          }
        }

        const { error: groupUpdateError } = await supabaseAdmin
          .from("quote_document_groups")
          .update(updateData)
          .eq("id", groupId);

        if (groupUpdateError) throw groupUpdateError;

        // Recalculate group totals
        await supabaseAdmin.rpc("recalculate_group_from_assignments", {
          p_group_id: groupId,
        });

        console.log(`✅ [SAVE-CORRECTION] Updated group ${dbField} to ${correctedValue}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Group ${dbField} updated successfully`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ============================================
      // PAGE-LEVEL CORRECTIONS
      // ============================================

      case "page_word_count": {
        if (!pageId) {
          throw new Error("Missing pageId for page word count correction");
        }

        const { error: pageUpdateError } = await supabaseAdmin
          .from("quote_pages")
          .update({
            word_count: parseInt(correctedValue, 10),
          })
          .eq("id", pageId);

        if (pageUpdateError) throw pageUpdateError;

        // Find and recalculate any group this page is assigned to
        const { data: assignment } = await supabaseAdmin
          .from("quote_page_group_assignments")
          .select("group_id")
          .eq("page_id", pageId)
          .single();

        if (assignment?.group_id) {
          await supabaseAdmin.rpc("recalculate_group_from_assignments", {
            p_group_id: assignment.group_id,
          });
        }

        console.log(`✅ [SAVE-CORRECTION] Updated page ${pageId} word count to ${correctedValue}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Page word count updated successfully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ============================================
      // CUSTOMER FIELD CORRECTIONS
      // ============================================

      case "customer_email":
      case "customer_phone":
      case "customer_full_name": {
        // Get customer_id from quote
        const { data: quote } = await supabaseAdmin
          .from("quotes")
          .select("customer_id")
          .eq("id", resolvedQuoteId)
          .single();

        if (!quote?.customer_id) {
          throw new Error("Quote not found or no customer linked");
        }

        const customerFieldMap: Record<string, string> = {
          customer_email: "email",
          customer_phone: "phone",
          customer_full_name: "full_name",
        };

        const { error: customerUpdateError } = await supabaseAdmin
          .from("customers")
          .update({
            [customerFieldMap[field]]: correctedValue,
            updated_at: new Date().toISOString(),
          })
          .eq("id", quote.customer_id);

        if (customerUpdateError) throw customerUpdateError;

        // Log the correction
        if (resolvedQuoteId) {
          await supabaseAdmin.from("staff_corrections").insert({
            quote_id: resolvedQuoteId,
            field_name: field,
            ai_value: originalValue,
            corrected_value: correctedValue,
            correction_reason: reason,
            created_by_staff_id: staffId,
          });
        }

        console.log(`✅ [SAVE-CORRECTION] Updated ${field} to ${correctedValue}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Customer ${customerFieldMap[field]} updated successfully`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // ============================================
      // QUOTE-LEVEL CORRECTIONS
      // ============================================

      case "tax_rate":
      case "discount":
      case "surcharge":
      case "delivery_option":
      case "shipping_address":
      case "billing_address":
      case "payment_method": {
        const quoteUpdateData: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        if (field === "tax_rate") {
          quoteUpdateData.tax_rate = parseFloat(correctedValue);
        } else if (field === "delivery_option") {
          quoteUpdateData.delivery_option_id = correctedValue;
        } else if (field === "shipping_address" || field === "billing_address") {
          quoteUpdateData[field] = JSON.parse(correctedValue);
        } else {
          quoteUpdateData[field] = correctedValue;
        }

        const { error: quoteUpdateError } = await supabaseAdmin
          .from("quotes")
          .update(quoteUpdateData)
          .eq("id", resolvedQuoteId);

        if (quoteUpdateError) throw quoteUpdateError;

        // Recalculate totals if tax rate changed
        if (field === "tax_rate") {
          await supabaseAdmin.rpc("recalculate_quote_totals", {
            p_quote_id: resolvedQuoteId,
          });
        }

        // Log the correction
        await supabaseAdmin.from("staff_corrections").insert({
          quote_id: resolvedQuoteId,
          field_name: field,
          ai_value: originalValue,
          corrected_value: correctedValue,
          correction_reason: reason,
          created_by_staff_id: staffId,
        });

        console.log(`✅ [SAVE-CORRECTION] Updated quote ${field}`);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Quote ${field} updated successfully`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      default: {
        console.warn(`⚠️ [SAVE-CORRECTION] Unknown field: ${field}`);

        // Try to save as generic correction
        if (resolvedQuoteId) {
          await supabaseAdmin.from("staff_corrections").insert({
            quote_id: resolvedQuoteId,
            analysis_id: analysisId,
            field_name: field,
            ai_value: originalValue,
            corrected_value: correctedValue,
            correction_reason: reason || "Staff correction",
            created_by_staff_id: staffId,
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: `Correction logged for field: ${field}`,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  } catch (error) {
    console.error("❌ [SAVE-CORRECTION] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
