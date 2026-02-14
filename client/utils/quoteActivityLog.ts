import { supabase } from "../lib/supabase";

export async function logQuoteActivity(
  quoteId: string,
  staffId: string,
  actionType: string,
  details: Record<string, unknown> = {}
) {
  const { error } = await supabase.from("quote_activity_log").insert({
    quote_id: quoteId,
    staff_id: staffId,
    action_type: actionType,
    details,
  });
  if (error) console.error("Failed to log quote activity:", error);
  // Non-blocking: activity logging should never prevent the primary action
}
