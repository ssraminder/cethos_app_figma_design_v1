import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { useQuote } from "@/context/QuoteContext";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";

export default function Contact() {
  const navigate = useNavigate();
  const { state, updateState, goToNextStep, goToPreviousStep, validateStep } = useQuote();

  const handleBack = () => {
    goToPreviousStep();
    navigate("/review");
  };

  const handleContinue = async () => {
    const success = await goToNextStep();
    if (success) {
      navigate("/success");
    }
  };

  const updateField = (field: string, value: string) => {
    updateState({ [field]: value });
  };

  const handleCustomerTypeChange = (type: "individual" | "business") => {
    updateState({ customerType: type });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 w-full">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16">
          {/* Step Indicator */}
          <StepIndicator currentStep={state.currentStep} />

          {/* Content Container */}
          <div className="max-w-[896px] mx-auto">
            {/* Page Title */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
                Contact Information
              </h1>
              <p className="text-base text-cethos-slate">
                How should we reach you about your order?
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
                        ? "bg-cethos-blue text-white"
                        : "bg-white border border-cethos-border text-cethos-slate hover:border-cethos-blue"
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCustomerTypeChange("business")}
                    className={`h-12 rounded-lg font-semibold text-base transition-all ${
                      state.customerType === "business"
                        ? "bg-cethos-blue text-white"
                        : "bg-white border border-cethos-border text-cethos-slate hover:border-cethos-blue"
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
                    className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
                  />
                </div>
              )}

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={state.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    placeholder="John"
                    className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={state.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    placeholder="Smith"
                    className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
                  />
                </div>
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
                  className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
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
                  className="w-full h-12 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
                />
                <p className="mt-2 text-xs text-cethos-slate">
                  For urgent order updates only
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
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer
        onBack={handleBack}
        onContinue={handleContinue}
        canContinue={validateStep(4)}
        showBack={true}
      />
    </div>
  );
}
