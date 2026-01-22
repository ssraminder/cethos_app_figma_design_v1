import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { useDropzone } from "react-dropzone";
import { AlertTriangle, Upload, File, X, CheckCircle, Loader2 } from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface QuoteFile {
  id: string;
  original_filename: string;
  needs_replacement: boolean;
  replacement_reason: string | null;
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  customer_id: string;
}

interface HitlReview {
  resolution_notes: string;
  completed_at: string;
}

export default function QuoteRevisionPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [files, setFiles] = useState<QuoteFile[]>([]);
  const [review, setReview] = useState<HitlReview | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  // Fetch quote and file data
  useEffect(() => {
    const fetchData = async () => {
      if (!quoteId) return;
      
      try {
        // Fetch quote
        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .select("id, quote_number, status, customer_id")
          .eq("id", quoteId)
          .single();
        
        if (quoteError) throw quoteError;
        
        // Verify status is revision_needed
        if (quoteData.status !== "revision_needed") {
          setError("This quote does not require revision.");
          setLoading(false);
          return;
        }
        
        setQuote(quoteData);
        
        // Fetch files that need replacement
        const { data: filesData, error: filesError } = await supabase
          .from("quote_files")
          .select("id, original_filename, needs_replacement, replacement_reason")
          .eq("quote_id", quoteId);
        
        if (filesError) throw filesError;
        setFiles(filesData || []);
        
        // Fetch rejection reason from HITL review
        const { data: reviewData } = await supabase
          .from("hitl_reviews")
          .select("resolution_notes, completed_at")
          .eq("quote_id", quoteId)
          .eq("status", "rejected")
          .order("completed_at", { ascending: false })
          .limit(1)
          .single();
        
        if (reviewData) {
          setReview(reviewData);
        }
        
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load quote details. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [quoteId]);

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setNewFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle file upload and resubmission
  const handleSubmit = async () => {
    if (newFiles.length === 0) {
      alert("Please upload at least one file.");
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    try {
      const totalFiles = newFiles.length;
      let uploadedCount = 0;
      
      for (const file of newFiles) {
        // Generate unique filename
        const fileExt = file.name.split(".").pop();
        const fileName = `${quoteId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("quote-files")
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        // Create file record
        const { error: insertError } = await supabase
          .from("quote_files")
          .insert({
            quote_id: quoteId,
            original_filename: file.name,
            storage_path: fileName,
            file_size: file.size,
            mime_type: file.type,
            upload_status: "uploaded",
            is_replacement: true,
          });
        
        if (insertError) throw insertError;
        
        uploadedCount++;
        setUploadProgress(Math.round((uploadedCount / totalFiles) * 100));
      }
      
      // Update quote status back to processing
      await supabase
        .from("quotes")
        .update({ status: "processing" })
        .eq("id", quoteId);
      
      // Trigger reprocessing
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ quoteId }),
        }
      );
      
      setSubmitted(true);
      
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload files. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-green-800 mb-2">
            Files Uploaded Successfully!
          </h2>
          <p className="text-green-600 mb-4">
            Your documents are being re-analyzed. We'll email you when your updated quote is ready.
          </p>
          <p className="text-sm text-green-700 mb-6">
            Quote: <span className="font-medium">{quote?.quote_number}</span>
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Main revision view
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-amber-800 mb-1">
                Action Required
              </h1>
              <p className="text-amber-700">
                We need clearer copies of your documents to provide an accurate quote.
              </p>
              <p className="text-sm text-amber-600 mt-2">
                Quote: <span className="font-medium">{quote?.quote_number}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Rejection Reason */}
        {review?.resolution_notes && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              Message from Our Team
            </h2>
            <p className="text-gray-800">{review.resolution_notes}</p>
          </div>
        )}

        {/* Original Files List */}
        {files.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Original Files
            </h2>
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    file.needs_replacement ? "bg-red-50" : "bg-gray-50"
                  }`}
                >
                  <File className={`w-5 h-5 ${file.needs_replacement ? "text-red-500" : "text-gray-400"}`} />
                  <span className="text-sm text-gray-700 flex-1 truncate">
                    {file.original_filename}
                  </span>
                  {file.needs_replacement && (
                    <span className="text-xs text-red-600 font-medium">
                      Needs replacement
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload New Files */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Upload New Files
          </h2>
          
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 mb-1">
              {isDragActive
                ? "Drop files here..."
                : "Drag & drop files here, or click to select"}
            </p>
            <p className="text-xs text-gray-500">
              PDF, PNG, JPG up to 10MB each
            </p>
          </div>

          {/* New Files List */}
          {newFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {newFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-green-50 rounded-lg"
                >
                  <File className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-700 flex-1 truncate">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  <button
                    onClick={() => removeNewFile(index)}
                    className="p-1 hover:bg-green-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {uploading && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-sm text-gray-600">Uploading files...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={newFiles.length === 0 || uploading}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Uploading..." : "Submit New Files"}
        </button>
      </div>
    </div>
  );
}
