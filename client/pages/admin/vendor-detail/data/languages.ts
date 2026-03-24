// Comprehensive BCP 47 language list for vendor language pair dropdowns
// Grouped by base language for SearchableSelect component

export interface LanguageOption {
  code: string;
  name: string;
  group: string;
}

export const LANGUAGES: LanguageOption[] = [
  // ── Afrikaans ──
  { code: "AF", name: "Afrikaans", group: "Afrikaans" },
  { code: "AF-ZA", name: "Afrikaans (South Africa)", group: "Afrikaans" },

  // ── Albanian ──
  { code: "SQ", name: "Albanian", group: "Albanian" },
  { code: "SQ-AL", name: "Albanian (Albania)", group: "Albanian" },
  { code: "SQ-XK", name: "Albanian (Kosovo)", group: "Albanian" },

  // ── Amharic ──
  { code: "AM", name: "Amharic", group: "Amharic" },
  { code: "AM-ET", name: "Amharic (Ethiopia)", group: "Amharic" },

  // ── Arabic ──
  { code: "AR", name: "Arabic", group: "Arabic" },
  { code: "AR-AE", name: "Arabic (UAE)", group: "Arabic" },
  { code: "AR-BH", name: "Arabic (Bahrain)", group: "Arabic" },
  { code: "AR-DZ", name: "Arabic (Algeria)", group: "Arabic" },
  { code: "AR-EG", name: "Arabic (Egypt)", group: "Arabic" },
  { code: "AR-IQ", name: "Arabic (Iraq)", group: "Arabic" },
  { code: "AR-JO", name: "Arabic (Jordan)", group: "Arabic" },
  { code: "AR-KW", name: "Arabic (Kuwait)", group: "Arabic" },
  { code: "AR-LB", name: "Arabic (Lebanon)", group: "Arabic" },
  { code: "AR-LY", name: "Arabic (Libya)", group: "Arabic" },
  { code: "AR-MA", name: "Arabic (Morocco)", group: "Arabic" },
  { code: "AR-OM", name: "Arabic (Oman)", group: "Arabic" },
  { code: "AR-QA", name: "Arabic (Qatar)", group: "Arabic" },
  { code: "AR-SA", name: "Arabic (Saudi Arabia)", group: "Arabic" },
  { code: "AR-SD", name: "Arabic (Sudan)", group: "Arabic" },
  { code: "AR-SY", name: "Arabic (Syria)", group: "Arabic" },
  { code: "AR-TN", name: "Arabic (Tunisia)", group: "Arabic" },
  { code: "AR-YE", name: "Arabic (Yemen)", group: "Arabic" },

  // ── Armenian ──
  { code: "HY", name: "Armenian", group: "Armenian" },
  { code: "HY-AM", name: "Armenian (Armenia)", group: "Armenian" },

  // ── Azerbaijani ──
  { code: "AZ", name: "Azerbaijani", group: "Azerbaijani" },
  { code: "AZ-AZ", name: "Azerbaijani (Azerbaijan)", group: "Azerbaijani" },

  // ── Belarusian ──
  { code: "BE", name: "Belarusian", group: "Belarusian" },
  { code: "BE-BY", name: "Belarusian (Belarus)", group: "Belarusian" },

  // ── Bengali ──
  { code: "BN", name: "Bengali", group: "Bengali" },
  { code: "BN-BD", name: "Bengali (Bangladesh)", group: "Bengali" },
  { code: "BN-IN", name: "Bengali (India)", group: "Bengali" },

  // ── Bosnian ──
  { code: "BS", name: "Bosnian", group: "Bosnian" },
  { code: "BS-BA", name: "Bosnian (Bosnia and Herzegovina)", group: "Bosnian" },

  // ── Bulgarian ──
  { code: "BG", name: "Bulgarian", group: "Bulgarian" },
  { code: "BG-BG", name: "Bulgarian (Bulgaria)", group: "Bulgarian" },

  // ── Burmese ──
  { code: "MY", name: "Burmese", group: "Burmese" },
  { code: "MY-MM", name: "Burmese (Myanmar)", group: "Burmese" },

  // ── Catalan ──
  { code: "CA", name: "Catalan", group: "Catalan" },
  { code: "CA-ES", name: "Catalan (Spain)", group: "Catalan" },
  { code: "CA-AD", name: "Catalan (Andorra)", group: "Catalan" },

  // ── Chinese ──
  { code: "ZH", name: "Chinese", group: "Chinese" },
  { code: "ZH-CN", name: "Chinese (Simplified)", group: "Chinese" },
  { code: "ZH-TW", name: "Chinese (Traditional)", group: "Chinese" },
  { code: "ZH-HK", name: "Chinese (Hong Kong)", group: "Chinese" },
  { code: "ZH-SG", name: "Chinese (Singapore)", group: "Chinese" },

  // ── Croatian ──
  { code: "HR", name: "Croatian", group: "Croatian" },
  { code: "HR-HR", name: "Croatian (Croatia)", group: "Croatian" },

  // ── Czech ──
  { code: "CS", name: "Czech", group: "Czech" },
  { code: "CS-CZ", name: "Czech (Czech Republic)", group: "Czech" },

  // ── Danish ──
  { code: "DA", name: "Danish", group: "Danish" },
  { code: "DA-DK", name: "Danish (Denmark)", group: "Danish" },

  // ── Dutch ──
  { code: "NL", name: "Dutch", group: "Dutch" },
  { code: "NL-NL", name: "Dutch (Netherlands)", group: "Dutch" },
  { code: "NL-BE", name: "Dutch (Belgium)", group: "Dutch" },
  { code: "NL-SR", name: "Dutch (Suriname)", group: "Dutch" },

  // ── English ──
  { code: "EN", name: "English", group: "English" },
  { code: "EN-US", name: "English (United States)", group: "English" },
  { code: "EN-GB", name: "English (United Kingdom)", group: "English" },
  { code: "EN-CA", name: "English (Canada)", group: "English" },
  { code: "EN-AU", name: "English (Australia)", group: "English" },
  { code: "EN-NZ", name: "English (New Zealand)", group: "English" },
  { code: "EN-ZA", name: "English (South Africa)", group: "English" },
  { code: "EN-IE", name: "English (Ireland)", group: "English" },
  { code: "EN-IN", name: "English (India)", group: "English" },
  { code: "EN-PH", name: "English (Philippines)", group: "English" },
  { code: "EN-SG", name: "English (Singapore)", group: "English" },

  // ── Estonian ──
  { code: "ET", name: "Estonian", group: "Estonian" },
  { code: "ET-EE", name: "Estonian (Estonia)", group: "Estonian" },

  // ── Filipino / Tagalog ──
  { code: "TL", name: "Tagalog", group: "Filipino / Tagalog" },
  { code: "FIL", name: "Filipino", group: "Filipino / Tagalog" },
  { code: "FIL-PH", name: "Filipino (Philippines)", group: "Filipino / Tagalog" },

  // ── Finnish ──
  { code: "FI", name: "Finnish", group: "Finnish" },
  { code: "FI-FI", name: "Finnish (Finland)", group: "Finnish" },

  // ── French ──
  { code: "FR", name: "French", group: "French" },
  { code: "FR-FR", name: "French (France)", group: "French" },
  { code: "FR-CA", name: "French (Canada)", group: "French" },
  { code: "FR-BE", name: "French (Belgium)", group: "French" },
  { code: "FR-CH", name: "French (Switzerland)", group: "French" },
  { code: "FR-LU", name: "French (Luxembourg)", group: "French" },
  { code: "FR-MC", name: "French (Monaco)", group: "French" },
  { code: "FR-SN", name: "French (Senegal)", group: "French" },
  { code: "FR-CI", name: "French (Ivory Coast)", group: "French" },
  { code: "FR-CM", name: "French (Cameroon)", group: "French" },
  { code: "FR-CD", name: "French (DR Congo)", group: "French" },
  { code: "FR-HT", name: "French (Haiti)", group: "French" },

  // ── Galician ──
  { code: "GL", name: "Galician", group: "Galician" },
  { code: "GL-ES", name: "Galician (Spain)", group: "Galician" },

  // ── Georgian ──
  { code: "KA", name: "Georgian", group: "Georgian" },
  { code: "KA-GE", name: "Georgian (Georgia)", group: "Georgian" },

  // ── German ──
  { code: "DE", name: "German", group: "German" },
  { code: "DE-DE", name: "German (Germany)", group: "German" },
  { code: "DE-AT", name: "German (Austria)", group: "German" },
  { code: "DE-CH", name: "German (Switzerland)", group: "German" },
  { code: "DE-LU", name: "German (Luxembourg)", group: "German" },
  { code: "DE-LI", name: "German (Liechtenstein)", group: "German" },

  // ── Greek ──
  { code: "EL", name: "Greek", group: "Greek" },
  { code: "EL-GR", name: "Greek (Greece)", group: "Greek" },
  { code: "EL-CY", name: "Greek (Cyprus)", group: "Greek" },

  // ── Gujarati ──
  { code: "GU", name: "Gujarati", group: "Gujarati" },
  { code: "GU-IN", name: "Gujarati (India)", group: "Gujarati" },

  // ── Haitian Creole ──
  { code: "HT", name: "Haitian Creole", group: "Haitian Creole" },

  // ── Hausa ──
  { code: "HA", name: "Hausa", group: "Hausa" },
  { code: "HA-NG", name: "Hausa (Nigeria)", group: "Hausa" },

  // ── Hebrew ──
  { code: "HE", name: "Hebrew", group: "Hebrew" },
  { code: "HE-IL", name: "Hebrew (Israel)", group: "Hebrew" },

  // ── Hindi ──
  { code: "HI", name: "Hindi", group: "Hindi" },
  { code: "HI-IN", name: "Hindi (India)", group: "Hindi" },

  // ── Hungarian ──
  { code: "HU", name: "Hungarian", group: "Hungarian" },
  { code: "HU-HU", name: "Hungarian (Hungary)", group: "Hungarian" },

  // ── Icelandic ──
  { code: "IS", name: "Icelandic", group: "Icelandic" },
  { code: "IS-IS", name: "Icelandic (Iceland)", group: "Icelandic" },

  // ── Igbo ──
  { code: "IG", name: "Igbo", group: "Igbo" },
  { code: "IG-NG", name: "Igbo (Nigeria)", group: "Igbo" },

  // ── Indonesian ──
  { code: "ID", name: "Indonesian", group: "Indonesian" },
  { code: "ID-ID", name: "Indonesian (Indonesia)", group: "Indonesian" },

  // ── Italian ──
  { code: "IT", name: "Italian", group: "Italian" },
  { code: "IT-IT", name: "Italian (Italy)", group: "Italian" },
  { code: "IT-CH", name: "Italian (Switzerland)", group: "Italian" },

  // ── Japanese ──
  { code: "JA", name: "Japanese", group: "Japanese" },
  { code: "JA-JP", name: "Japanese (Japan)", group: "Japanese" },

  // ── Kannada ──
  { code: "KN", name: "Kannada", group: "Kannada" },
  { code: "KN-IN", name: "Kannada (India)", group: "Kannada" },

  // ── Kazakh ──
  { code: "KK", name: "Kazakh", group: "Kazakh" },
  { code: "KK-KZ", name: "Kazakh (Kazakhstan)", group: "Kazakh" },

  // ── Khmer ──
  { code: "KM", name: "Khmer", group: "Khmer" },
  { code: "KM-KH", name: "Khmer (Cambodia)", group: "Khmer" },

  // ── Kinyarwanda ──
  { code: "RW", name: "Kinyarwanda", group: "Kinyarwanda" },
  { code: "RW-RW", name: "Kinyarwanda (Rwanda)", group: "Kinyarwanda" },

  // ── Korean ──
  { code: "KO", name: "Korean", group: "Korean" },
  { code: "KO-KR", name: "Korean (South Korea)", group: "Korean" },
  { code: "KO-KP", name: "Korean (North Korea)", group: "Korean" },

  // ── Kurdish ──
  { code: "KU", name: "Kurdish", group: "Kurdish" },
  { code: "KU-IQ", name: "Kurdish (Iraq)", group: "Kurdish" },
  { code: "KU-TR", name: "Kurdish (Turkey)", group: "Kurdish" },

  // ── Lao ──
  { code: "LO", name: "Lao", group: "Lao" },
  { code: "LO-LA", name: "Lao (Laos)", group: "Lao" },

  // ── Latvian ──
  { code: "LV", name: "Latvian", group: "Latvian" },
  { code: "LV-LV", name: "Latvian (Latvia)", group: "Latvian" },

  // ── Lithuanian ──
  { code: "LT", name: "Lithuanian", group: "Lithuanian" },
  { code: "LT-LT", name: "Lithuanian (Lithuania)", group: "Lithuanian" },

  // ── Macedonian ──
  { code: "MK", name: "Macedonian", group: "Macedonian" },
  { code: "MK-MK", name: "Macedonian (North Macedonia)", group: "Macedonian" },

  // ── Malay ──
  { code: "MS", name: "Malay", group: "Malay" },
  { code: "MS-MY", name: "Malay (Malaysia)", group: "Malay" },
  { code: "MS-SG", name: "Malay (Singapore)", group: "Malay" },
  { code: "MS-BN", name: "Malay (Brunei)", group: "Malay" },

  // ── Malayalam ──
  { code: "ML", name: "Malayalam", group: "Malayalam" },
  { code: "ML-IN", name: "Malayalam (India)", group: "Malayalam" },

  // ── Maltese ──
  { code: "MT", name: "Maltese", group: "Maltese" },
  { code: "MT-MT", name: "Maltese (Malta)", group: "Maltese" },

  // ── Marathi ──
  { code: "MR", name: "Marathi", group: "Marathi" },
  { code: "MR-IN", name: "Marathi (India)", group: "Marathi" },

  // ── Mongolian ──
  { code: "MN", name: "Mongolian", group: "Mongolian" },
  { code: "MN-MN", name: "Mongolian (Mongolia)", group: "Mongolian" },

  // ── Nepali ──
  { code: "NE", name: "Nepali", group: "Nepali" },
  { code: "NE-NP", name: "Nepali (Nepal)", group: "Nepali" },

  // ── Norwegian ──
  { code: "NO", name: "Norwegian", group: "Norwegian" },
  { code: "NB", name: "Norwegian Bokm\u00e5l", group: "Norwegian" },
  { code: "NB-NO", name: "Norwegian Bokm\u00e5l (Norway)", group: "Norwegian" },
  { code: "NN", name: "Norwegian Nynorsk", group: "Norwegian" },
  { code: "NN-NO", name: "Norwegian Nynorsk (Norway)", group: "Norwegian" },

  // ── Oriya / Odia ──
  { code: "OR", name: "Odia", group: "Odia" },
  { code: "OR-IN", name: "Odia (India)", group: "Odia" },

  // ── Pashto ──
  { code: "PS", name: "Pashto", group: "Pashto" },
  { code: "PS-AF", name: "Pashto (Afghanistan)", group: "Pashto" },
  { code: "PS-PK", name: "Pashto (Pakistan)", group: "Pashto" },

  // ── Persian ──
  { code: "FA", name: "Persian", group: "Persian" },
  { code: "FA-IR", name: "Persian (Iran)", group: "Persian" },
  { code: "FA-AF", name: "Dari (Afghanistan)", group: "Persian" },

  // ── Polish ──
  { code: "PL", name: "Polish", group: "Polish" },
  { code: "PL-PL", name: "Polish (Poland)", group: "Polish" },

  // ── Portuguese ──
  { code: "PT", name: "Portuguese", group: "Portuguese" },
  { code: "PT-BR", name: "Portuguese (Brazil)", group: "Portuguese" },
  { code: "PT-PT", name: "Portuguese (Portugal)", group: "Portuguese" },
  { code: "PT-AO", name: "Portuguese (Angola)", group: "Portuguese" },
  { code: "PT-MZ", name: "Portuguese (Mozambique)", group: "Portuguese" },

  // ── Punjabi ──
  { code: "PA", name: "Punjabi", group: "Punjabi" },
  { code: "PA-IN", name: "Punjabi (India)", group: "Punjabi" },
  { code: "PA-PK", name: "Punjabi (Pakistan)", group: "Punjabi" },

  // ── Romanian ──
  { code: "RO", name: "Romanian", group: "Romanian" },
  { code: "RO-RO", name: "Romanian (Romania)", group: "Romanian" },
  { code: "RO-MD", name: "Romanian (Moldova)", group: "Romanian" },

  // ── Russian ──
  { code: "RU", name: "Russian", group: "Russian" },
  { code: "RU-RU", name: "Russian (Russia)", group: "Russian" },
  { code: "RU-BY", name: "Russian (Belarus)", group: "Russian" },
  { code: "RU-KZ", name: "Russian (Kazakhstan)", group: "Russian" },
  { code: "RU-UA", name: "Russian (Ukraine)", group: "Russian" },

  // ── Serbian ──
  { code: "SR", name: "Serbian", group: "Serbian" },
  { code: "SR-RS", name: "Serbian (Serbia)", group: "Serbian" },
  { code: "SR-LATN", name: "Serbian (Latin)", group: "Serbian" },
  { code: "SR-CYRL", name: "Serbian (Cyrillic)", group: "Serbian" },

  // ── Sinhala ──
  { code: "SI", name: "Sinhala", group: "Sinhala" },
  { code: "SI-LK", name: "Sinhala (Sri Lanka)", group: "Sinhala" },

  // ── Slovak ──
  { code: "SK", name: "Slovak", group: "Slovak" },
  { code: "SK-SK", name: "Slovak (Slovakia)", group: "Slovak" },

  // ── Slovenian ──
  { code: "SL", name: "Slovenian", group: "Slovenian" },
  { code: "SL-SI", name: "Slovenian (Slovenia)", group: "Slovenian" },

  // ── Somali ──
  { code: "SO", name: "Somali", group: "Somali" },
  { code: "SO-SO", name: "Somali (Somalia)", group: "Somali" },
  { code: "SO-KE", name: "Somali (Kenya)", group: "Somali" },

  // ── Spanish ──
  { code: "ES", name: "Spanish", group: "Spanish" },
  { code: "ES-ES", name: "Spanish (Spain)", group: "Spanish" },
  { code: "ES-MX", name: "Spanish (Mexico)", group: "Spanish" },
  { code: "ES-AR", name: "Spanish (Argentina)", group: "Spanish" },
  { code: "ES-CO", name: "Spanish (Colombia)", group: "Spanish" },
  { code: "ES-CL", name: "Spanish (Chile)", group: "Spanish" },
  { code: "ES-PE", name: "Spanish (Peru)", group: "Spanish" },
  { code: "ES-VE", name: "Spanish (Venezuela)", group: "Spanish" },
  { code: "ES-EC", name: "Spanish (Ecuador)", group: "Spanish" },
  { code: "ES-US", name: "Spanish (United States)", group: "Spanish" },
  { code: "ES-419", name: "Spanish (Latin America)", group: "Spanish" },

  // ── Swahili ──
  { code: "SW", name: "Swahili", group: "Swahili" },
  { code: "SW-KE", name: "Swahili (Kenya)", group: "Swahili" },
  { code: "SW-TZ", name: "Swahili (Tanzania)", group: "Swahili" },

  // ── Swedish ──
  { code: "SV", name: "Swedish", group: "Swedish" },
  { code: "SV-SE", name: "Swedish (Sweden)", group: "Swedish" },
  { code: "SV-FI", name: "Swedish (Finland)", group: "Swedish" },

  // ── Tamil ──
  { code: "TA", name: "Tamil", group: "Tamil" },
  { code: "TA-IN", name: "Tamil (India)", group: "Tamil" },
  { code: "TA-LK", name: "Tamil (Sri Lanka)", group: "Tamil" },
  { code: "TA-SG", name: "Tamil (Singapore)", group: "Tamil" },

  // ── Telugu ──
  { code: "TE", name: "Telugu", group: "Telugu" },
  { code: "TE-IN", name: "Telugu (India)", group: "Telugu" },

  // ── Thai ──
  { code: "TH", name: "Thai", group: "Thai" },
  { code: "TH-TH", name: "Thai (Thailand)", group: "Thai" },

  // ── Tigrinya ──
  { code: "TI", name: "Tigrinya", group: "Tigrinya" },
  { code: "TI-ER", name: "Tigrinya (Eritrea)", group: "Tigrinya" },
  { code: "TI-ET", name: "Tigrinya (Ethiopia)", group: "Tigrinya" },

  // ── Turkish ──
  { code: "TR", name: "Turkish", group: "Turkish" },
  { code: "TR-TR", name: "Turkish (Turkey)", group: "Turkish" },
  { code: "TR-CY", name: "Turkish (Cyprus)", group: "Turkish" },

  // ── Ukrainian ──
  { code: "UK", name: "Ukrainian", group: "Ukrainian" },
  { code: "UK-UA", name: "Ukrainian (Ukraine)", group: "Ukrainian" },

  // ── Urdu ──
  { code: "UR", name: "Urdu", group: "Urdu" },
  { code: "UR-PK", name: "Urdu (Pakistan)", group: "Urdu" },
  { code: "UR-IN", name: "Urdu (India)", group: "Urdu" },

  // ── Uzbek ──
  { code: "UZ", name: "Uzbek", group: "Uzbek" },
  { code: "UZ-UZ", name: "Uzbek (Uzbekistan)", group: "Uzbek" },

  // ── Vietnamese ──
  { code: "VI", name: "Vietnamese", group: "Vietnamese" },
  { code: "VI-VN", name: "Vietnamese (Vietnam)", group: "Vietnamese" },

  // ── Wolof ──
  { code: "WO", name: "Wolof", group: "Wolof" },
  { code: "WO-SN", name: "Wolof (Senegal)", group: "Wolof" },

  // ── Yoruba ──
  { code: "YO", name: "Yoruba", group: "Yoruba" },
  { code: "YO-NG", name: "Yoruba (Nigeria)", group: "Yoruba" },
];

// Group order for SearchableSelect (alphabetical by group name)
export const LANGUAGE_GROUP_ORDER = LANGUAGES.reduce<string[]>((acc, lang) => {
  if (!acc.includes(lang.group)) acc.push(lang.group);
  return acc;
}, []);

// Convert to SearchableSelect format
export const LANGUAGE_OPTIONS = LANGUAGES.map((lang) => ({
  value: lang.code,
  label: `${lang.code} \u2014 ${lang.name}`,
  group: lang.group,
}));

// Get display name for a language code
export function getLanguageName(code: string): string {
  const lang = LANGUAGES.find(
    (l) => l.code.toUpperCase() === code.toUpperCase()
  );
  return lang?.name ?? code;
}
