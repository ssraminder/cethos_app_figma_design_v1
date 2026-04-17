// Central fetch client for kiosk edge functions. Injects device headers and
// (when set) the short-lived staff unlock token. The device credentials live
// in localStorage; the staff token lives only in memory — clearing it is the
// "hand to customer" action.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const DEVICE_LS_KEY = "cethos_kiosk_device";

export interface KioskDeviceCreds {
  device_id: string;
  device_secret: string;
  device_name: string;
}

export function getDeviceCreds(): KioskDeviceCreds | null {
  try {
    const raw = localStorage.getItem(DEVICE_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.device_id || !parsed.device_secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setDeviceCreds(creds: KioskDeviceCreds): void {
  localStorage.setItem(DEVICE_LS_KEY, JSON.stringify(creds));
}

export function clearDeviceCreds(): void {
  localStorage.removeItem(DEVICE_LS_KEY);
}

// Staff token — in-memory only, wiped on tab close and between transactions.
let staffToken: string | null = null;
let staffInfo: { staff_id: string; staff_name: string; staff_email: string } | null =
  null;
let staffTokenExpiresAt: number | null = null;

export function setStaffAuth(
  token: string,
  info: { staff_id: string; staff_name: string; staff_email: string },
  expiresAt: string,
): void {
  staffToken = token;
  staffInfo = info;
  staffTokenExpiresAt = new Date(expiresAt).getTime();
}

export function clearStaffAuth(): void {
  staffToken = null;
  staffInfo = null;
  staffTokenExpiresAt = null;
}

export function hasStaffAuth(): boolean {
  if (!staffToken || !staffTokenExpiresAt) return false;
  if (staffTokenExpiresAt < Date.now()) {
    clearStaffAuth();
    return false;
  }
  return true;
}

export function getStaffInfo() {
  return staffInfo;
}

// ─── Request helpers ────────────────────────────────────────────────────────

function buildHeaders(
  opts: { includeStaff?: boolean; includeDevice?: boolean } = {},
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (opts.includeDevice !== false) {
    const creds = getDeviceCreds();
    if (creds) {
      h["x-kiosk-device-id"] = creds.device_id;
      h["x-kiosk-device-secret"] = creds.device_secret;
    }
  }
  if (opts.includeStaff && staffToken) {
    h["x-kiosk-staff-token"] = staffToken;
  }
  return h;
}

export async function kioskPost<T = unknown>(
  fnName: string,
  body: unknown,
  opts: { includeStaff?: boolean; includeDevice?: boolean } = {},
): Promise<T> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: { ...buildHeaders(opts), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || (data && data.success === false)) {
    throw new Error(data?.error || `Request failed (${resp.status})`);
  }
  return data as T;
}

export async function kioskUploadFile(
  fnName: string,
  file: File,
  extraFields: Record<string, string>,
): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: buildHeaders({ includeStaff: true }),
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || (data && data.success === false)) {
    throw new Error(data?.error || `Upload failed (${resp.status})`);
  }
  return data;
}
