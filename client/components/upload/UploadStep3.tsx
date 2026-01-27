import { Lock, ChevronRight, ChevronLeft } from "lucide-react";
import { useUpload } from "@/context/UploadContext";
import StartOverLink from "@/components/StartOverLink";

export default function UploadStep3() {
  const { state, updateState, goToNextStep, goToPreviousStep } = useUpload();

  const updateField = (field: string, value: string) => {
    updateState({ [field]: value });
  };

  const handleCustomerTypeChange = (type: "individual" | "business") => {
    updateState({ customerType: type });
  };

  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Contact Information
        </h1>
        <p className="text-base text-cethos-slate">
          How should we reach you about your quote?
        </p>
      </div>

      {/* Form Section */}
      <div className="bg-white border-2 border-cethos-border rounded-xl p-6 sm:p-8 space-y-6">
        {/* Customer Type Toggle */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-3">
            I am ordering as: <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => handleCustomerTypeChange("individual")}
              className={`h-12 rounded-lg font-semibold text-base transition-all ${
                state.customerType === "individual"
                  ? "bg-cethos-teal text-white"
                  : "bg-white border border-cethos-border text-cethos-gray hover:border-cethos-teal"
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => handleCustomerTypeChange("business")}
              className={`h-12 rounded-lg font-semibold text-base transition-all ${
                state.customerType === "business"
                  ? "bg-cethos-teal text-white"
                  : "bg-white border border-cethos-border text-cethos-gray hover:border-cethos-teal"
              }`}
            >
              Business
            </button>
          </div>
        </div>

        {/* Company Name (Conditional) */}
        {state.customerType === "business" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
              Company Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={state.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
              placeholder="Your company name"
              className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-sm"
            />
          </div>
        )}

        {/* Full Name */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={state.fullName}
            onChange={(e) => updateField("fullName", e.target.value)}
            placeholder="John Smith"
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-sm"
          />
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={state.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="your.email@example.com"
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-sm"
          />
          <p className="mt-2 text-xs text-cethos-slate">
            We'll send your quote and order updates here
          </p>
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={state.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent text-sm"
          />
          <p className="mt-2 text-xs text-cethos-slate">
            For urgent quote updates only
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="pt-4 border-t border-cethos-border">
          <div className="flex items-center gap-2 text-cethos-slate-light">
            <Lock className="w-4 h-4" />
            <p className="text-xs">
              Your information is secure and will never be shared
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-8">
        <StartOverLink />
        <div className="flex items-center gap-4">
          <button
            onClick={goToPreviousStep}
            className="flex items-center gap-2 px-6 py-3 border-2 border-cethos-border text-cethos-gray rounded-lg hover:bg-cethos-bg-light font-medium transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          <button
            onClick={goToNextStep}
            disabled={
              !state.fullName ||
              !state.email ||
              !state.phone ||
              (state.customerType === "business" && !state.companyName)
            }
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base text-white transition-all ${
              state.fullName &&
              state.email &&
              state.phone &&
              (state.customerType === "individual" || state.companyName)
                ? "bg-cethos-teal hover:bg-cethos-teal-light"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            <span>Continue</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </>
  );
}
