/* DEPRECATED: HITL removed — replaced by review_required tag on quotes.
 * HITLDocumentCard is no longer used.
 * Kept commented for safe rollback.
 */

import React from "react";

interface HITLDocumentCardProps {
  file: any;
  index: number;
  analysis: any | null;
  isExpanded: boolean;
  hasChanges: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export default function HITLDocumentCard(_props: HITLDocumentCardProps) {
  return null; // DEPRECATED: HITL removed
}

/*
ORIGINAL CODE — DO NOT DELETE (safe deprecation)
=================================================
// SURGICAL FIX COMPONENT: Handles documents with or without AI analysis
import React from "react";
import { AlertTriangle, CheckCircle, Loader2, FileText } from "lucide-react";
... (full original content preserved in git history)
*/
