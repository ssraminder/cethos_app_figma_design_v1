// Public / consumer email providers that are NOT acceptable as reference
// contacts. Applicants must give us a business email so we can corroborate
// the working relationship (you can't verify someone's claim of "I worked
// at Acme Corp" if the reference's email is acmebob@gmail.com).
//
// Hosts are matched case-insensitively against the part after '@'.
// This is a curated short list of the top 40-ish providers that cover the
// large majority of free webmail addresses we see in applications. We do
// NOT try to be exhaustive — false negatives are acceptable (a niche
// public provider slipping through is fine; the staff reviewer catches
// those manually). False positives (rejecting a real business address)
// would be a worse failure mode.

export const PUBLIC_EMAIL_DOMAINS = new Set<string>([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  // Yahoo (all common TLD variants)
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.in",
  "yahoo.ca",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.es",
  "yahoo.it",
  "ymail.com",
  "rocketmail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // AOL
  "aol.com",
  // Proton
  "protonmail.com",
  "proton.me",
  "pm.me",
  // German free webmail
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "web.de",
  "t-online.de",
  "freenet.de",
  // Other Western free providers
  "mail.com",
  "fastmail.com",
  "fastmail.fm",
  "hey.com",
  "hushmail.com",
  "tutanota.com",
  "tutanota.de",
  "tuta.io",
  "zoho.com",
  // Russian / CIS
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  // Chinese
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",
  "sina.cn",
  "sohu.com",
  "yeah.net",
  // Korean / Japanese
  "naver.com",
  "daum.net",
  // Indian
  "rediffmail.com",
]);

export function isPublicEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const host = email.slice(at + 1).trim().toLowerCase();
  return PUBLIC_EMAIL_DOMAINS.has(host);
}
