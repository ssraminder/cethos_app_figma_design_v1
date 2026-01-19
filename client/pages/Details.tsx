import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import StepIndicator from "@/components/StepIndicator";
import Footer from "@/components/Footer";
import LanguageSelect from "@/components/LanguageSelect";
import PurposeSelect from "@/components/PurposeSelect";
import CountrySelect from "@/components/CountrySelect";

export default function Details() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    sourceLanguage: "",
    targetLanguage: "English",
    purpose: "",
    country: "",
    specialInstructions: "",
  });

  const handleBack = () => {
    navigate("/");
  };

  const handleContinue = () => {
    navigate("/review");
  };

  const isFormValid =
    formData.sourceLanguage &&
    formData.targetLanguage &&
    formData.purpose &&
    formData.country;

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 w-full">
        <div className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16">
          {/* Step Indicator */}
          <StepIndicator currentStep={2} />

          {/* Content Container */}
          <div className="max-w-[896px] mx-auto">
            {/* Page Title */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
                Translation Details
              </h1>
              <p className="text-base text-cethos-slate">
                Provide information about your translation requirements
              </p>
            </div>

            {/* Form Section */}
            <div className="bg-white border-2 border-cethos-border rounded-xl p-6 sm:p-8 space-y-6">
              {/* Source Language */}
              <div>
                <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                  Source Language <span className="text-red-500">*</span>
                </label>
                <LanguageSelect
                  value={formData.sourceLanguage}
                  onChange={(value) => updateField("sourceLanguage", value)}
                  placeholder="Select source language"
                />
              </div>

              {/* Target Language */}
              <div>
                <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                  Target Language <span className="text-red-500">*</span>
                </label>
                <LanguageSelect
                  value={formData.targetLanguage}
                  onChange={(value) => updateField("targetLanguage", value)}
                  placeholder="Select target language"
                />
              </div>

              {/* Purpose of Translation */}
              <div>
                <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                  Purpose of Translation <span className="text-red-500">*</span>
                </label>
                <PurposeSelect
                  value={formData.purpose}
                  onChange={(value) => updateField("purpose", value)}
                />
              </div>

              {/* Country of Issue */}
              <div>
                <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                  Country of Issue <span className="text-red-500">*</span>
                </label>
                <CountrySelect
                  value={formData.country}
                  onChange={(value) => updateField("country", value)}
                />
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-cethos-slate-dark font-semibold text-sm mb-2">
                  Special Instructions (Optional)
                </label>
                <textarea
                  value={formData.specialInstructions}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 500);
                    updateField("specialInstructions", value);
                  }}
                  placeholder="Add any special instructions or notes for your translation..."
                  className="w-full h-32 px-4 py-3 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm resize-none"
                  maxLength={500}
                />
                <div className="mt-2 text-xs text-cethos-slate text-right">
                  {formData.specialInstructions.length}/500 characters
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
        canContinue={isFormValid}
        showBack={true}
      />
    </div>
  );
}
