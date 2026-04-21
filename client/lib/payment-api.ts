const BASE_URL = "https://lmzoyezvsjgsxveoakdr.supabase.co/functions/v1";

function getAuthToken(): string {
  return (
    localStorage.getItem("sb-access-token") ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

export async function callPaymentApi(
  functionName: string,
  params: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || data.message || `API error ${res.status}`);
  }

  return data;
}

/** Format a number as $1,234.56 CAD. Accepts an optional currency tag. */
export function formatCurrency(amount: number, currency = "CAD"): string {
  return `$${amount.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/** Format a date string as "Mar 26, 2026" */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
