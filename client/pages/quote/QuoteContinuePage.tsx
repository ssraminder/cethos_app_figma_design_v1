import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react";

interface QuoteFile {
  id: string;
  original_filename: string;
  storage_path: string;
  ai_processing_status: "pending" | "processing" | "completed" | "failed" | "skipped";
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  entry_point: string | null;
  source_location: string | null;
}

export default function QuoteContinuePage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"not_found" | "expired" | "converted" | "generic" | null>(null);
  const [processingStarted, setProcessingStarted] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);

  // Ref to track if component is still mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Calculate progress
  const completedCount = files.filter(
    (f) =>
      f.ai_processing_status === "completed" ||
      f.ai_processing_status === "failed" ||
      f.ai_processing_status === "skipped"
  ).length;
  const progress = files.length > 0 ? (completedCount / files.length) * 100 : 0;

  // Load quote and files
  const loadQuoteData = useCallback(async () => {
    if (!quoteId) {
      setError("No quote ID provided");
      setErrorType("not_found");
      setLoading(false);
      return;
    }

    try {
      // Load quote
      const { data: quoteData, error: quoteError } = await supabase
        .from("quotes")
        .select("id, quote_number, status, entry_point, source_location")
        .eq("id", quoteId)
        .single();

      if (quoteError || !quoteData) {
        setError("Quote not found. It may have been deleted or the link is invalid.");
        setErrorType("not_found");
        setLoading(false);
        return;
      }

      // Validate quote state
      if (quoteData.status === "converted") {
        setError("This quote has already been converted to an order.");
        setErrorType("converted");
        setLoading(false);
        return;
      }

      if (quoteData.status === "expired") {
        setError("This quote has expired. Please start a new quote.");
        setErrorType("expired");
        setLoading(false);
        return;
      }

      // If quote is not draft, redirect to the main quote page to resume
      if (quoteData.status !== "draft") {
        navigate(`/quote?quote_id=${quoteId}`);
        return;
      }

      setQuote(quoteData);

      // Load files
      const { data: filesData, error: filesError } = await supabase
        .from("quote_files")
        .select("id, original_filename, storage_path, ai_processing_status")
        .eq("quote_id", quoteId)
        .order("sort_order");

      if (filesError) {
        console.error("Error loading files:", filesError);
      }

      if (filesData && filesData.length > 0) {
        setFiles(filesData);
      } else {
        // No files uploaded - redirect to fresh start
        setError("No files found for this quote. Please upload your documents.");
        setErrorType("not_found");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      // Handle AbortError gracefully
      if (err?.name === "AbortError" || err?.message?.includes("AbortError")) {
        console.log("Quote data fetch aborted - component likely unmounted");
        return;
      }

      console.error("Error loading quote:", err);

      // Only update state if still mounted
      if (isMountedRef.current) {
        setError("Failed to load quote data. Please try again.");
        setErrorType("generic");
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [quoteId, navigate]);

  useEffect(() => {
    loadQuoteData();
  }, [loadQuoteData]);

  // Show skip button after 15 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowSkipButton(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  // Start AI processing once data is loaded
  useEffect(() => {
    if (quote && files.length > 0 && !processingStarted && !loading) {
      setProcessingStarted(true);
      triggerAIProcessing();
    }
  }, [quote, files, processingStarted, loading]);

  // Redirect when all files processed
  useEffect(() => {
    if (processingStarted && files.length > 0 && completedCount === files.length) {
      // Small delay for UX
      const timer = setTimeout(() => {
        navigate(`/quote?quote_id=${quoteId}&step=2`);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [completedCount, files.length, processingStarted, quoteId, navigate]);

  // Timeout - auto-redirect after 60 seconds even if processing isn't complete
  useEffect(() => {
    if (processingStarted && files.length > 0) {
      const timeout = setTimeout(() => {
        // If not all files are processed after 60 seconds, continue anyway
        if (completedCount < files.length) {
          console.log("Processing timeout reached, continuing to step 2");
          navigate(`/quote?quote_id=${quoteId}&step=2`);
        }
      }, 60000);
      return () => clearTimeout(timeout);
    }
  }, [processingStarted, files.length, completedCount, quoteId, navigate]);

  const triggerAIProcessing = async () => {
    const pendingFiles = files.filter((f) => f.ai_processing_status === "pending");

    // Process files sequentially to avoid overwhelming the server
    for (const file of pendingFiles) {
      // Check if component is still mounted before processing
      if (!isMountedRef.current) {
        console.log("Component unmounted, stopping AI processing");
        return;
      }

      try {
        // Update local state to show processing
        if (isMountedRef.current) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, ai_processing_status: "processing" as const } : f
            )
          );
        }

        // Call process-document Edge Function
        const { data, error } = await supabase.functions.invoke("process-document", {
          body: {
            fileId: file.id,
            quoteId: quoteId,
          },
        });

        // Check if component is still mounted before updating state
        if (!isMountedRef.current) {
          console.log("Component unmounted during processing, skipping state update");
          return;
        }

        if (error) {
          console.error("Error processing file:", file.id, error);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, ai_processing_status: "failed" as const } : f
            )
          );
        } else {
          console.log("File processed successfully:", file.id, data);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, ai_processing_status: "completed" as const } : f
            )
          );
        }
      } catch (err: any) {
        // Handle AbortError gracefully - this happens when component unmounts during fetch
        if (err?.name === "AbortError" || err?.message?.includes("AbortError")) {
          console.log("Fetch aborted for file:", file.id, "- component likely unmounted");
          return; // Stop processing, don't update state
        }

        console.error("Error processing file:", file.id, err);

        // Only update state if still mounted
        if (isMountedRef.current) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, ai_processing_status: "failed" as const } : f
            )
          );
        }
      }
    }
  };

  const handleSkip = () => {
    // Mark remaining as skipped and continue
    navigate(`/quote?quote_id=${quoteId}&step=2`);
  };

  const handleStartNew = () => {
    navigate("/quote");
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading your quote...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              errorType === "expired" ? "bg-yellow-100" : "bg-red-100"
            }`}
          >
            {errorType === "expired" ? (
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {errorType === "expired"
              ? "Quote Expired"
              : errorType === "converted"
                ? "Already Converted"
                : "Unable to Continue"}
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleStartNew}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Start New Quote
          </button>
          {errorType === "converted" && (
            <p className="text-sm text-gray-500 mt-4">
              Check your email for order confirmation details.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Processing state
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <div className="text-center">
          {/* Animated Spinner */}
          <div className="w-16 h-16 mx-auto mb-6">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Your Documents</h2>

          <p className="text-gray-600 mb-6">
            Our AI is analyzing your documents to prepare your instant quote. This usually takes
            10-30 seconds.
          </p>

          {/* File Progress List */}
          <div className="text-left space-y-3 mb-6">
            {files.map((file) => (
              <div key={file.id} className="flex items-center gap-3 p-2 rounded bg-gray-50">
                {file.ai_processing_status === "completed" ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : file.ai_processing_status === "processing" ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                ) : file.ai_processing_status === "failed" ? (
                  <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={`text-sm truncate ${
                    file.ai_processing_status === "completed"
                      ? "text-green-700"
                      : file.ai_processing_status === "failed"
                        ? "text-orange-700"
                        : "text-gray-700"
                  }`}
                >
                  {file.original_filename}
                </span>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-sm text-gray-500">
            {completedCount} of {files.length} documents analyzed
          </p>

          {/* Skip Button (appears after delay) */}
          {showSkipButton && completedCount < files.length && (
            <button
              onClick={handleSkip}
              className="mt-6 text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Taking too long? Continue without waiting &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
