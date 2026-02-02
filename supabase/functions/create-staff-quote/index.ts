import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CustomerData {
  email?: string;
  phone?: string;
  fullName: string;
  customerType: "individual" | "business";
  companyName?: string;
}

interface QuoteData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      staffId,
      customerData,
      quoteData,
      quoteSourceId,
      entryPoint = "staff_manual",
      notes,
    }: {
      staffId: string;
      customerData: CustomerData;
      quoteData: QuoteData;
      quoteSourceId?: string;
      entryPoint: string;
      notes?: string;
    } = await req.json();

    // Validate required fields
    if (!staffId || !customerData?.fullName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: staffId, customerData.fullName",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Must have at least email OR phone
    if (!customerData.email && !customerData.phone) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Customer must have at least email or phone",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
      },
    );

    const now = new Date().toISOString();

    // 1. Verify staff user exists
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_users")
      .select("id")
      .eq("id", staffId)
      .single();

    if (staffError || !staff) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid staff ID",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Check if customer already exists (by email or phone)
    let customerId: string;
    let customerExists = false;

    if (customerData.email) {
      const { data: existingCustomer } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("email", customerData.email)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        customerExists = true;
      }
    }

    if (!customerExists && customerData.phone) {
      const { data: existingCustomer } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("phone", customerData.phone)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        customerExists = true;
      }
    }

    // 3. Create new customer if not exists
    if (!customerExists) {
      const { data: newCustomer, error: customerCreateError } =
        await supabaseAdmin
          .from("customers")
          .insert({
            email: customerData.email || null,
            phone: customerData.phone || null,
            full_name: customerData.fullName,
            customer_type: customerData.customerType,
            company_name: customerData.companyName || null,
            auth_user_id: null, // Staff-created customers don't have auth
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single();

      if (customerCreateError || !newCustomer) {
        console.error("Error creating customer:", customerCreateError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to create customer",
            details: customerCreateError?.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      customerId = newCustomer.id;
    }

    // 4. Generate quote number (find highest number for current year)
    const year = new Date().getFullYear();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const { data: existingQuotes } = await supabaseAdmin
      .from("quotes")
      .select("quote_number")
      .gte("created_at", yearStart)
      .lte("created_at", yearEnd)
      .like("quote_number", `QT-${year}-%`)
      .order("quote_number", { ascending: false })
      .limit(1);

    let nextNumber = 1;
    if (existingQuotes && existingQuotes.length > 0) {
      // Extract number from QT-2026-00005 format
      const lastNumber = existingQuotes[0].quote_number.split("-")[2];
      nextNumber = parseInt(lastNumber, 10) + 1;
    }

    const quoteNumber = `QT-${year}-${String(nextNumber).padStart(5, "0")}`;

    // 5. Create quote
    const { data: quote, error: quoteCreateError } = await supabaseAdmin
      .from("quotes")
      .insert({
        quote_number: quoteNumber,
        customer_id: customerId,
        status: "draft",
        created_by_staff_id: staffId,
        is_manual_quote: true,
        manual_quote_notes: notes || null,
        entry_point: entryPoint,
        source_language_id: quoteData.sourceLanguageId || null,
        target_language_id: quoteData.targetLanguageId || null,
        intended_use_id: quoteData.intendedUseId || null,
        country_of_issue: quoteData.countryOfIssue || null,
        special_instructions: quoteData.specialInstructions || null,
        quote_source_id: quoteSourceId || null,
        created_at: now,
        updated_at: now,
      })
      .select("id, quote_number")
      .single();

    if (quoteCreateError || !quote) {
      console.error("Error creating quote:", quoteCreateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create quote",
          details: quoteCreateError?.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 6. Log staff activity
    await supabaseAdmin.from("staff_activity_log").insert({
      staff_id: staffId,
      action: "create_manual_quote",
      details: {
        quote_id: quote.id,
        quote_number: quote.quote_number,
        customer_id: customerId,
        entry_point: entryPoint,
        customer_existed: customerExists,
      },
      created_at: now,
    });

    return new Response(
      JSON.stringify({
        success: true,
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        customerId: customerId,
        customerExists: customerExists,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in create-staff-quote:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
