/* DEPRECATED: HITL removed — replaced by review_required tag on quotes.
 * This entire settings page is no longer needed.
 * Kept commented for safe rollback. Remove after confirming review_required works.
 */

import React from "react";

export default function HITLThresholdsSettings() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-500 text-lg">HITL Thresholds have been deprecated.</p>
        <p className="text-gray-400 text-sm mt-2">Review is now handled via the review_required tag.</p>
      </div>
    </div>
  );
}

/*
ORIGINAL CODE — DO NOT DELETE (safe deprecation)
=================================================
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuthContext } from "@/context/AdminAuthContext";
import AdminSettingsLayout from "@/components/admin/settings/AdminSettingsLayout";
import SettingsCard from "@/components/admin/settings/SettingsCard";
import SettingsInput from "@/components/admin/settings/SettingsInput";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface HITLThresholds {
  hitl_ocr_confidence_threshold: number;
  hitl_language_confidence_threshold: number;
  hitl_classification_confidence_threshold: number;
  hitl_complexity_confidence_threshold: number;
  hitl_high_value_threshold: number;
  hitl_high_page_count_threshold: number;
  hitl_always_rush: boolean;
  hitl_always_same_day: boolean;
  hitl_sla_hours: number;
  hitl_rush_sla_hours: number;
}

export default function HITLThresholdsSettings() {
  ... (full original content preserved above in git history)
}
*/
