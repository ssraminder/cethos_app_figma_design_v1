import { useState, useEffect } from "react";
import Select from "react-select";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";

interface TranslationData {
  sourceLanguageId?: string;
  targetLanguageId?: string;
  intendedUseId?: string;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface StaffTranslationDetailsFormProps {
  value: TranslationData;
  onChange: (data: TranslationData) => void;
}

// Common countries list
const COUNTRIES = [
  { value: "Afghanistan", label: "Afghanistan" },
  { value: "Albania", label: "Albania" },
  { value: "Algeria", label: "Algeria" },
  { value: "Andorra", label: "Andorra" },
  { value: "Angola", label: "Angola" },
  { value: "Argentina", label: "Argentina" },
  { value: "Armenia", label: "Armenia" },
  { value: "Australia", label: "Australia" },
  { value: "Austria", label: "Austria" },
  { value: "Azerbaijan", label: "Azerbaijan" },
  { value: "Bahamas", label: "Bahamas" },
  { value: "Bahrain", label: "Bahrain" },
  { value: "Bangladesh", label: "Bangladesh" },
  { value: "Barbados", label: "Barbados" },
  { value: "Belarus", label: "Belarus" },
  { value: "Belgium", label: "Belgium" },
  { value: "Belize", label: "Belize" },
  { value: "Benin", label: "Benin" },
  { value: "Bhutan", label: "Bhutan" },
  { value: "Bolivia", label: "Bolivia" },
  { value: "Bosnia and Herzegovina", label: "Bosnia and Herzegovina" },
  { value: "Botswana", label: "Botswana" },
  { value: "Brazil", label: "Brazil" },
  { value: "Brunei", label: "Brunei" },
  { value: "Bulgaria", label: "Bulgaria" },
  { value: "Burkina Faso", label: "Burkina Faso" },
  { value: "Burundi", label: "Burundi" },
  { value: "Cambodia", label: "Cambodia" },
  { value: "Cameroon", label: "Cameroon" },
  { value: "Canada", label: "Canada" },
  { value: "Cape Verde", label: "Cape Verde" },
  { value: "Central African Republic", label: "Central African Republic" },
  { value: "Chad", label: "Chad" },
  { value: "Chile", label: "Chile" },
  { value: "China", label: "China" },
  { value: "Colombia", label: "Colombia" },
  { value: "Comoros", label: "Comoros" },
  { value: "Congo", label: "Congo" },
  { value: "Costa Rica", label: "Costa Rica" },
  { value: "Croatia", label: "Croatia" },
  { value: "Cuba", label: "Cuba" },
  { value: "Cyprus", label: "Cyprus" },
  { value: "Czech Republic", label: "Czech Republic" },
  { value: "Denmark", label: "Denmark" },
  { value: "Djibouti", label: "Djibouti" },
  { value: "Dominica", label: "Dominica" },
  { value: "Dominican Republic", label: "Dominican Republic" },
  { value: "Ecuador", label: "Ecuador" },
  { value: "Egypt", label: "Egypt" },
  { value: "El Salvador", label: "El Salvador" },
  { value: "Equatorial Guinea", label: "Equatorial Guinea" },
  { value: "Eritrea", label: "Eritrea" },
  { value: "Estonia", label: "Estonia" },
  { value: "Ethiopia", label: "Ethiopia" },
  { value: "Fiji", label: "Fiji" },
  { value: "Finland", label: "Finland" },
  { value: "France", label: "France" },
  { value: "Gabon", label: "Gabon" },
  { value: "Gambia", label: "Gambia" },
  { value: "Georgia", label: "Georgia" },
  { value: "Germany", label: "Germany" },
  { value: "Ghana", label: "Ghana" },
  { value: "Greece", label: "Greece" },
  { value: "Grenada", label: "Grenada" },
  { value: "Guatemala", label: "Guatemala" },
  { value: "Guinea", label: "Guinea" },
  { value: "Guinea-Bissau", label: "Guinea-Bissau" },
  { value: "Guyana", label: "Guyana" },
  { value: "Haiti", label: "Haiti" },
  { value: "Honduras", label: "Honduras" },
  { value: "Hungary", label: "Hungary" },
  { value: "Iceland", label: "Iceland" },
  { value: "India", label: "India" },
  { value: "Indonesia", label: "Indonesia" },
  { value: "Iran", label: "Iran" },
  { value: "Iraq", label: "Iraq" },
  { value: "Ireland", label: "Ireland" },
  { value: "Israel", label: "Israel" },
  { value: "Italy", label: "Italy" },
  { value: "Jamaica", label: "Jamaica" },
  { value: "Japan", label: "Japan" },
  { value: "Jordan", label: "Jordan" },
  { value: "Kazakhstan", label: "Kazakhstan" },
  { value: "Kenya", label: "Kenya" },
  { value: "Kiribati", label: "Kiribati" },
  { value: "Kuwait", label: "Kuwait" },
  { value: "Kyrgyzstan", label: "Kyrgyzstan" },
  { value: "Laos", label: "Laos" },
  { value: "Latvia", label: "Latvia" },
  { value: "Lebanon", label: "Lebanon" },
  { value: "Lesotho", label: "Lesotho" },
  { value: "Liberia", label: "Liberia" },
  { value: "Libya", label: "Libya" },
  { value: "Liechtenstein", label: "Liechtenstein" },
  { value: "Lithuania", label: "Lithuania" },
  { value: "Luxembourg", label: "Luxembourg" },
  { value: "Madagascar", label: "Madagascar" },
  { value: "Malawi", label: "Malawi" },
  { value: "Malaysia", label: "Malaysia" },
  { value: "Maldives", label: "Maldives" },
  { value: "Mali", label: "Mali" },
  { value: "Malta", label: "Malta" },
  { value: "Marshall Islands", label: "Marshall Islands" },
  { value: "Mauritania", label: "Mauritania" },
  { value: "Mauritius", label: "Mauritius" },
  { value: "Mexico", label: "Mexico" },
  { value: "Micronesia", label: "Micronesia" },
  { value: "Moldova", label: "Moldova" },
  { value: "Monaco", label: "Monaco" },
  { value: "Mongolia", label: "Mongolia" },
  { value: "Montenegro", label: "Montenegro" },
  { value: "Morocco", label: "Morocco" },
  { value: "Mozambique", label: "Mozambique" },
  { value: "Myanmar", label: "Myanmar" },
  { value: "Namibia", label: "Namibia" },
  { value: "Nauru", label: "Nauru" },
  { value: "Nepal", label: "Nepal" },
  { value: "Netherlands", label: "Netherlands" },
  { value: "New Zealand", label: "New Zealand" },
  { value: "Nicaragua", label: "Nicaragua" },
  { value: "Niger", label: "Niger" },
  { value: "Nigeria", label: "Nigeria" },
  { value: "North Korea", label: "North Korea" },
  { value: "North Macedonia", label: "North Macedonia" },
  { value: "Norway", label: "Norway" },
  { value: "Oman", label: "Oman" },
  { value: "Pakistan", label: "Pakistan" },
  { value: "Palau", label: "Palau" },
  { value: "Palestine", label: "Palestine" },
  { value: "Panama", label: "Panama" },
  { value: "Papua New Guinea", label: "Papua New Guinea" },
  { value: "Paraguay", label: "Paraguay" },
  { value: "Peru", label: "Peru" },
  { value: "Philippines", label: "Philippines" },
  { value: "Poland", label: "Poland" },
  { value: "Portugal", label: "Portugal" },
  { value: "Qatar", label: "Qatar" },
  { value: "Romania", label: "Romania" },
  { value: "Russia", label: "Russia" },
  { value: "Rwanda", label: "Rwanda" },
  { value: "Saint Kitts and Nevis", label: "Saint Kitts and Nevis" },
  { value: "Saint Lucia", label: "Saint Lucia" },
  {
    value: "Saint Vincent and the Grenadines",
    label: "Saint Vincent and the Grenadines",
  },
  { value: "Samoa", label: "Samoa" },
  { value: "San Marino", label: "San Marino" },
  { value: "Sao Tome and Principe", label: "Sao Tome and Principe" },
  { value: "Saudi Arabia", label: "Saudi Arabia" },
  { value: "Senegal", label: "Senegal" },
  { value: "Serbia", label: "Serbia" },
  { value: "Seychelles", label: "Seychelles" },
  { value: "Sierra Leone", label: "Sierra Leone" },
  { value: "Singapore", label: "Singapore" },
  { value: "Slovakia", label: "Slovakia" },
  { value: "Slovenia", label: "Slovenia" },
  { value: "Solomon Islands", label: "Solomon Islands" },
  { value: "Somalia", label: "Somalia" },
  { value: "South Africa", label: "South Africa" },
  { value: "South Korea", label: "South Korea" },
  { value: "South Sudan", label: "South Sudan" },
  { value: "Spain", label: "Spain" },
  { value: "Sri Lanka", label: "Sri Lanka" },
  { value: "Sudan", label: "Sudan" },
  { value: "Suriname", label: "Suriname" },
  { value: "Sweden", label: "Sweden" },
  { value: "Switzerland", label: "Switzerland" },
  { value: "Syria", label: "Syria" },
  { value: "Taiwan", label: "Taiwan" },
  { value: "Tajikistan", label: "Tajikistan" },
  { value: "Tanzania", label: "Tanzania" },
  { value: "Thailand", label: "Thailand" },
  { value: "Timor-Leste", label: "Timor-Leste" },
  { value: "Togo", label: "Togo" },
  { value: "Tonga", label: "Tonga" },
  { value: "Trinidad and Tobago", label: "Trinidad and Tobago" },
  { value: "Tunisia", label: "Tunisia" },
  { value: "Turkey", label: "Turkey" },
  { value: "Turkmenistan", label: "Turkmenistan" },
  { value: "Tuvalu", label: "Tuvalu" },
  { value: "Uganda", label: "Uganda" },
  { value: "Ukraine", label: "Ukraine" },
  { value: "United Arab Emirates", label: "United Arab Emirates" },
  { value: "United Kingdom", label: "United Kingdom" },
  { value: "United States", label: "United States" },
  { value: "Uruguay", label: "Uruguay" },
  { value: "Uzbekistan", label: "Uzbekistan" },
  { value: "Vanuatu", label: "Vanuatu" },
  { value: "Vatican City", label: "Vatican City" },
  { value: "Venezuela", label: "Venezuela" },
  { value: "Vietnam", label: "Vietnam" },
  { value: "Yemen", label: "Yemen" },
  { value: "Zambia", label: "Zambia" },
  { value: "Zimbabwe", label: "Zimbabwe" },
];

export default function StaffTranslationDetailsForm({
  value,
  onChange,
}: StaffTranslationDetailsFormProps) {
  const { sourceLanguages, targetLanguages, intendedUses, loading, error } =
    useDropdownOptions();
  const [formData, setFormData] = useState<TranslationData>(value);

  useEffect(() => {
    setFormData(value);
  }, [value]);

  const handleChange = (field: keyof TranslationData, fieldValue: string) => {
    const updated = { ...formData, [field]: fieldValue };
    setFormData(updated);
    onChange(updated);
  };

  // Convert languages to react-select format
  const sourceLanguageOptions = sourceLanguages.map((lang) => ({
    value: lang.id,
    label: lang.name,
  }));

  const targetLanguageOptions = targetLanguages.map((lang) => ({
    value: lang.id,
    label: lang.name,
  }));

  const intendedUseOptions = intendedUses.map((use) => ({
    value: use.id,
    label: use.name,
  }));

  // Custom styles for react-select to match our design
  const customSelectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: "42px",
      borderColor: state.isFocused ? "#6366f1" : "#d1d5db",
      boxShadow: state.isFocused ? "0 0 0 2px rgba(99, 102, 241, 0.2)" : "none",
      "&:hover": {
        borderColor: "#6366f1",
      },
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#6366f1"
        : state.isFocused
          ? "#eef2ff"
          : "white",
      color: state.isSelected ? "white" : "#1f2937",
      "&:active": {
        backgroundColor: "#6366f1",
      },
    }),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-sm text-red-800">Error loading options: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Source Language */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Source Language (From)
        </label>
        <Select
          options={sourceLanguageOptions}
          value={sourceLanguageOptions.find(
            (opt) => opt.value === formData.sourceLanguageId,
          )}
          onChange={(option) =>
            handleChange("sourceLanguageId", option?.value || "")
          }
          isClearable
          isSearchable
          placeholder="Select or search source language..."
          styles={customSelectStyles}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      </div>

      {/* Target Language */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Language (To) *
        </label>
        <Select
          options={targetLanguageOptions}
          value={targetLanguageOptions.find(
            (opt) => opt.value === formData.targetLanguageId,
          )}
          onChange={(option) =>
            handleChange("targetLanguageId", option?.value || "")
          }
          isClearable
          isSearchable
          placeholder="Select or search target language..."
          styles={customSelectStyles}
          className="react-select-container"
          classNamePrefix="react-select"
        />
        {!formData.targetLanguageId && (
          <p className="mt-1 text-xs text-amber-600">
            Target language is required
          </p>
        )}
      </div>

      {/* Intended Use */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Intended Use
        </label>
        <Select
          options={intendedUseOptions}
          value={intendedUseOptions.find(
            (opt) => opt.value === formData.intendedUseId,
          )}
          onChange={(option) =>
            handleChange("intendedUseId", option?.value || "")
          }
          isClearable
          isSearchable
          placeholder="Select or search intended use..."
          styles={customSelectStyles}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      </div>

      {/* Country of Issue */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Country of Issue
        </label>
        <Select
          options={COUNTRIES}
          value={COUNTRIES.find((opt) => opt.value === formData.countryOfIssue)}
          onChange={(option) =>
            handleChange("countryOfIssue", option?.value || "")
          }
          isClearable
          isSearchable
          placeholder="Select or search country..."
          styles={customSelectStyles}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      </div>

      {/* Special Instructions */}
      <div>
        <label
          htmlFor="specialInstructions"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Special Instructions
        </label>
        <textarea
          id="specialInstructions"
          value={formData.specialInstructions || ""}
          onChange={(e) => handleChange("specialInstructions", e.target.value)}
          rows={4}
          placeholder="Any special requirements, formatting needs, or notes..."
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
    </div>
  );
}
