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

// ─── Request helpers ────────────────────────────────────────────────────────

function buildHeaders(
  opts: { includeDevice?: boolean } = {},
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
  return h;
}

export async function kioskPost<T = unknown>(
  fnName: string,
  body: unknown,
  opts: { includeDevice?: boolean } = {},
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
    headers: buildHeaders(),
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || (data && data.success === false)) {
    throw new Error(data?.error || `Upload failed (${resp.status})`);
  }
  return data;
}
