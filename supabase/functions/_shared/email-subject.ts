// ============================================================================
// email-subject.ts — shared subject builder for transactional emails
//
// Standardized format when the customer is a business customer
// (`customers.company_name IS NOT NULL`) AND the order carries an
// `internal_project_id`:
//
//     <Project #> · <Order #> · <Source → Target> · <Step name>
//
// For individual customers (no company_name), subjects keep today's
// form and just include the order # + language pair + step name when
// available — no project-number prefix.
//
// Every subject-builder either calls `buildEmailSubject({...})` for the
// "main" project subject, or composes its own and uses
// `prefixWithProject({...})` to prepend the project number when the
// customer is a business customer.
//
// Each consumer must SELECT:
//   customer.company_name
//   internal_project_id  →  internal_projects.project_number (via join)
//   step.name + source/target language NAMES (resolved from UUIDs via
//   languages table) — the existing notify-* helpers already do this.
// ============================================================================

export interface EmailSubjectContext {
  /** "Assigned", "New offer", "Counter accepted", etc. — verb/state prefix */
  eventLabel?: string | null;
  /** orders.order_number, e.g. "ORD-2026-10242" */
  orderNumber?: string | null;
  /** internal_projects.project_number, e.g. "PRJ-2026-00047" */
  projectNumber?: string | null;
  /** customers.company_name. Truthy = business customer = include prefix. */
  companyName?: string | null;
  /** Resolved source language name, e.g. "Romanian" */
  sourceLangName?: string | null;
  /** Resolved target language name, e.g. "English" */
  targetLangName?: string | null;
  /** Step name, e.g. "Translation" / "QA Review" */
  stepName?: string | null;
  /**
   * Free-form fallback for cases that don't fit the standard shape
   * (e.g. quote-level emails, invoice emails). If `eventLabel` is also
   * missing this becomes the entire subject after the project prefix.
   */
  trailing?: string | null;
}

function isBusiness(ctx: EmailSubjectContext): boolean {
  return !!(ctx.companyName && ctx.companyName.trim() && ctx.projectNumber && ctx.projectNumber.trim());
}

function langPairLabel(ctx: EmailSubjectContext): string | null {
  if (ctx.sourceLangName && ctx.targetLangName) return `${ctx.sourceLangName} → ${ctx.targetLangName}`;
  return ctx.sourceLangName || ctx.targetLangName || null;
}

/**
 * Compose a standardized subject:
 *   business + project + order: "<PRJ> · <ORD> · <Source → Target> · <Step>"
 *   business + project (no order): "<PRJ> · <eventLabel/trailing>"
 *   individual + order: "<eventLabel>: <ORD> — <Step> (<Source → Target>)"
 *   no order / no project: returns trailing as-is, or eventLabel as last resort
 *
 * Empty pieces are dropped; separators normalize. If `eventLabel` is set, the
 * caller's preferred verb prefix is preserved for individual customers (the
 * legacy "Assigned: ORD-..." pattern) but flattened for business customers
 * so the project number takes pride of place.
 */
export function buildEmailSubject(ctx: EmailSubjectContext): string {
  const business = isBusiness(ctx);
  const pair = langPairLabel(ctx);

  if (business) {
    // <PRJ> · <ORD> · <Source → Target> · <Step>
    const parts: string[] = [];
    parts.push(ctx.projectNumber!.trim());
    if (ctx.orderNumber) parts.push(ctx.orderNumber.trim());
    if (pair) parts.push(pair);
    if (ctx.stepName) parts.push(ctx.stepName.trim());
    if (parts.length > 0) {
      const subject = parts.join(" · ");
      // Preserve the verb prefix only when there's a clear event label and
      // no step name (e.g. order-level events: "Order complete: PRJ-…").
      if (ctx.eventLabel && !ctx.stepName) {
        return `${ctx.eventLabel.trim()}: ${subject}`;
      }
      return subject;
    }
    // Falls through to non-business path
  }

  // Individual customer / quote-level / no project number — keep legacy
  // "<eventLabel>: <ORD> — <Step> (<Source → Target>)" close to what each
  // builder used before.
  const tail: string[] = [];
  if (ctx.orderNumber) tail.push(ctx.orderNumber.trim());
  if (ctx.stepName) tail.push(`— ${ctx.stepName.trim()}`);
  if (pair) tail.push(`(${pair})`);
  const tailStr = tail.length > 0 ? tail.join(" ") : (ctx.trailing || "").trim();

  if (ctx.eventLabel && tailStr) {
    return `${ctx.eventLabel.trim()}: ${tailStr}`;
  }
  if (tailStr) return tailStr;
  return ctx.eventLabel?.trim() || ctx.trailing?.trim() || "Cethos notification";
}

/**
 * Prepend the project number when the customer is a business customer.
 * Use for subjects that don't fit the buildEmailSubject shape (e.g.
 * "Invoice recorded: ORD-…", reminder emails) so they still lead with
 * the project number for TRSB/Transperfect/etc.
 */
export function prefixWithProject(
  subject: string,
  ctx: { companyName?: string | null; projectNumber?: string | null },
): string {
  if (!ctx.companyName?.trim() || !ctx.projectNumber?.trim()) return subject;
  // Avoid double-prefixing if the caller already included it.
  const prj = ctx.projectNumber.trim();
  if (subject.startsWith(prj)) return subject;
  return `${prj} · ${subject}`;
}
