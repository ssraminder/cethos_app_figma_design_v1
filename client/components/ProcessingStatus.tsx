import { useEffect, useState } from "react";
import { Check, Mail, Loader2 } from "lucide-react";

interface ProcessingStatusProps {
  quoteId: string;
  onComplete: () => void;
  onEmailInstead: () => void;
}

interface ProcessingStep {
  label: string;
  status: "completed" | "processing" | "pending";
}

export default function ProcessingStatus({
  quoteId,
  onComplete,
  onEmailInstead,
}: ProcessingStatusProps) {
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<ProcessingStep[]>([
    { label: "Files uploaded", status: "completed" },
    { label: "Translation details saved", status: "completed" },
    { label: "Analyzing documents...", status: "processing" },
    { label: "Calculating pricing", status: "pending" },
  ]);

  // Simulate progress (in real implementation, poll the backend)
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        // Increment progress
        const newProgress = prev + 5;

        // Update step statuses based on progress
        if (newProgress >= 50 && newProgress < 80) {
          setSteps([
            { label: "Files uploaded", status: "completed" },
            { label: "Translation details saved", status: "completed" },
            { label: "Analyzing documents...", status: "completed" },
            { label: "Calculating pricing", status: "processing" },
          ]);
        } else if (newProgress >= 80) {
          setSteps([
            { label: "Files uploaded", status: "completed" },
            { label: "Translation details saved", status: "completed" },
            { label: "Analyzing documents...", status: "completed" },
            { label: "Calculating pricing", status: "completed" },
          ]);
        }

        return newProgress;
      });
    }, 400); // Update every 400ms for smooth animation

    return () => clearInterval(progressInterval);
  }, []);

  // Check if processing is complete
  useEffect(() => {
    if (progress >= 100) {
      // Wait 500ms before auto-navigating
      const timeout = setTimeout(() => {
        onComplete();
      }, 500);

      return () => clearTimeout(timeout);
    }
  }, [progress, onComplete]);

  // TODO: In production, replace with actual polling
  // useEffect(() => {
  //   const pollInterval = setInterval(async () => {
  //     const { data } = await supabase
  //       .from('quotes')
  //       .select('processing_status, processing_progress')
  //       .eq('id', quoteId)
  //       .single();
  //
  //     if (data?.processing_status === 'completed') {
  //       onComplete();
  //     } else {
  //       setProgress(data?.processing_progress || 0);
  //     }
  //   }, 2000);
  //
  //   return () => clearInterval(pollInterval);
  // }, [quoteId, onComplete]);

  return (
    <div className="max-w-[600px] mx-auto">
      {/* Main Card */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-cethos-navy mb-2">
            Almost there! We're finalizing your quote...
          </h2>
        </div>

        {/* Processing Steps */}
        <div className="space-y-4 mb-8">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-3">
              {/* Status Icon */}
              {step.status === "completed" && (
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
              {step.status === "processing" && (
                <div className="w-6 h-6 bg-cethos-blue rounded-full flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
              )}
              {step.status === "pending" && (
                <div className="w-6 h-6 border-2 border-cethos-border rounded-full flex-shrink-0" />
              )}

              {/* Step Label */}
              <span
                className={`text-sm ${
                  step.status === "completed"
                    ? "text-green-600 font-medium"
                    : step.status === "processing"
                      ? "text-cethos-blue font-semibold"
                      : "text-cethos-slate"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-cethos-blue transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right">
            <span className="text-sm font-semibold text-cethos-blue">
              {progress}%
            </span>
          </div>
        </div>

        {/* Time Estimate */}
        <div className="text-center mb-8">
          <p className="text-sm text-cethos-slate">
            Usually just a few more seconds
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-cethos-border mb-6" />

        {/* Email Option */}
        <div className="text-center">
          <p className="text-sm text-cethos-slate mb-3">Don't want to wait?</p>
          <button
            onClick={onEmailInstead}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-cethos-blue text-cethos-blue rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm"
          >
            <Mail className="w-4 h-4" />
            Email me when my quote is ready
          </button>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-6 text-center">
        <p className="text-xs text-cethos-slate">
          We're analyzing your documents to provide accurate pricing. This
          typically takes just a few seconds.
        </p>
      </div>
    </div>
  );
}
