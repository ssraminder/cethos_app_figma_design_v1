import { useState } from "react";
import {
  supabase,
  isSupabaseEnabled,
  Quote,
  QuoteFile,
  Customer,
} from "@/lib/supabase";
import { toast } from "sonner";
import type { UploadedFile } from "@/context/QuoteContext";

export function useSupabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Generate quote number
  const generateQuoteNumber = (): string => {
    const randomNum = Math.floor(Math.random() * 90000) + 10000;
    return `QT-2026-${randomNum}`;
  };

  // Step 1: Create quote and upload files
  const createQuoteWithFiles = async (
    files: UploadedFile[],
  ): Promise<{ quoteId: string; quoteNumber: string } | null> => {
    // Return early if Supabase is not configured
    if (!isSupabaseEnabled() || !supabase) {
      console.log("📝 Supabase not configured - skipping database operations");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const quoteNumber = generateQuoteNumber();

      // Create quote record
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          quote_number: quoteNumber,
          status: "draft",
        })
        .select()
        .single();

      if (quoteError) throw quoteError;
      if (!quote) throw new Error("Failed to create quote");

      // Upload files and create file records
      const uploadPromises = files.map(async (file) => {
        try {
          // Upload to storage
          const storagePath = `${quote.id}/${file.name}`;
          const { error: uploadError } = await supabase.storage
            .from("quote-files")
            .upload(storagePath, file.file, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            console.error(`Failed to upload ${file.name}:`, uploadError);
            toast.error(`Failed to upload ${file.name}`);
            return null;
          }

          // Create file record in database
          const { error: fileRecordError } = await supabase
            .from("quote_files")
            .insert({
              quote_id: quote.id,
              original_filename: file.name,
              storage_path: storagePath,
              file_size: file.size,
              mime_type: file.type,
              upload_status: "uploaded",
            });

          if (fileRecordError) {
            console.error(
              `Failed to create file record for ${file.name}:`,
              fileRecordError,
            );
            return null;
          }

          return file.id;
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          toast.error(`Error uploading ${file.name}`);
          return null;
        }
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter(Boolean).length;

      if (successCount === 0) {
        toast.error("Failed to upload any files");
      } else if (successCount < files.length) {
        toast.warning(`Uploaded ${successCount} of ${files.length} files`);
      } else {
        toast.success("All files uploaded successfully");
      }

      setLoading(false);
      return { quoteId: quote.id, quoteNumber };
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      toast.error("Failed to create quote");
      console.error("Create quote error:", error);
      return null;
    }
  };

  // Step 2: Update quote with translation details
  const updateQuoteDetails = async (
    quoteId: string,
    details: {
      sourceLanguageId: string;
      targetLanguageId: string;
      intendedUseId: string;
      countryOfIssue: string;
      countryId: string;
      certificationTypeId: string;
      specialInstructions: string;
    },
  ): Promise<boolean> => {
    // Return early if Supabase is not configured
    if (!isSupabaseEnabled() || !supabase) {
      console.log("📝 Supabase not configured - skipping database operations");
      return true; // Don't block navigation
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          source_language_id: details.sourceLanguageId,
          target_language_id: details.targetLanguageId,
          intended_use_id: details.intendedUseId,
          country_of_issue: details.countryOfIssue,
          country_id: details.countryId,
          certification_type_id: details.certificationTypeId,
          special_instructions: details.specialInstructions,
          status: "details_pending",
        })
        .eq("id", quoteId);

      if (updateError) throw updateError;

      toast.success("Quote details saved");
      setLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      toast.error("Failed to save quote details");
      console.error("Update quote details error:", error);
      return false;
    }
  };

  // Step 4: Create or update customer
  const createOrUpdateCustomer = async (
    quoteId: string,
    customerData: {
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
      customerType: "individual" | "business";
      companyName?: string;
    },
  ): Promise<boolean> => {
    // Return early if Supabase is not configured
    if (!isSupabaseEnabled() || !supabase) {
      console.log("📝 Supabase not configured - skipping database operations");
      return true; // Don't block navigation
    }

    setLoading(true);
    setError(null);

    try {
      const fullName = `${customerData.firstName} ${customerData.lastName}`;

      // Check if customer exists
      const { data: existingCustomer, error: lookupError } = await supabase
        .from("customers")
        .select("id")
        .eq("email", customerData.email)
        .maybeSingle();

      // Ignore "no rows" errors, but throw other errors
      if (lookupError && lookupError.code !== "PGRST116") {
        throw lookupError;
      }

      let customerId: string;

      if (existingCustomer) {
        // Update existing customer
        const { error: updateError } = await supabase
          .from("customers")
          .update({
            full_name: fullName,
            phone: customerData.phone,
            customer_type: customerData.customerType,
            company_name: customerData.companyName || null,
          })
          .eq("id", existingCustomer.id);

        if (updateError) throw updateError;
        customerId = existingCustomer.id;
        toast.success("Customer information updated");
      } else {
        // Create new customer
        const { data: newCustomer, error: createError } = await supabase
          .from("customers")
          .insert({
            email: customerData.email,
            full_name: fullName,
            phone: customerData.phone,
            customer_type: customerData.customerType,
            company_name: customerData.companyName || null,
          })
          .select()
          .single();

        if (createError) throw createError;
        if (!newCustomer) throw new Error("Failed to create customer");

        customerId = newCustomer.id;
        toast.success("Customer created");
      }

      // Update quote with customer ID
      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update({
          customer_id: customerId,
          status: "quote_ready",
        })
        .eq("id", quoteId);

      if (quoteUpdateError) throw quoteUpdateError;

      setLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      toast.error("Failed to save customer information");
      console.error("Create/update customer error:", error);
      return false;
    }
  };

  // Step 5: Finalize quote with pricing
  const finalizeQuote = async (
    quoteId: string,
    fileCount: number,
  ): Promise<boolean> => {
    // Return early if Supabase is not configured
    if (!isSupabaseEnabled() || !supabase) {
      console.log("📝 Supabase not configured - skipping database operations");
      return true; // Don't block navigation
    }

    setLoading(true);
    setError(null);

    try {
      // Calculate pricing (Phase 1 placeholders)
      const subtotal = fileCount * 65;
      const certificationTotal = fileCount * 50;
      const taxRate = 0.05;
      const taxAmount = subtotal * taxRate;
      const total = subtotal + certificationTotal + taxAmount;

      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          subtotal,
          certification_total: certificationTotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          status: "awaiting_payment",
        })
        .eq("id", quoteId);

      if (updateError) throw updateError;

      toast.success("Quote finalized");
      setLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      toast.error("Failed to finalize quote");
      console.error("Finalize quote error:", error);
      return false;
    }
  };

  // Retry failed file upload
  const retryFileUpload = async (
    quoteId: string,
    file: UploadedFile,
  ): Promise<boolean> => {
    // Return early if Supabase is not configured
    if (!isSupabaseEnabled() || !supabase) {
      console.log("📝 Supabase not configured - skipping file retry");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const storagePath = `${quoteId}/${file.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("quote-files")
        .upload(storagePath, file.file, {
          cacheControl: "3600",
          upsert: true, // Allow overwrite on retry
        });

      if (uploadError) throw uploadError;

      // Update file record status
      const { error: updateError } = await supabase
        .from("quote_files")
        .update({ upload_status: "uploaded" })
        .eq("quote_id", quoteId)
        .eq("original_filename", file.name);

      if (updateError) throw updateError;

      toast.success(`${file.name} uploaded successfully`);
      setLoading(false);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      toast.error(`Failed to upload ${file.name}`);
      console.error("Retry upload error:", error);
      return false;
    }
  };

  return {
    loading,
    error,
    createQuoteWithFiles,
    updateQuoteDetails,
    createOrUpdateCustomer,
    finalizeQuote,
    retryFileUpload,
  };
}
