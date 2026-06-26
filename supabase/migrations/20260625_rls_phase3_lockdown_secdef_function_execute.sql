-- RLS remediation Phase 3 (#1): lock down EXECUTE on anon-callable SECURITY DEFINER functions.
--
-- WHY: these functions run as their owner (postgres) and BYPASS RLS. Supabase grants EXECUTE to anon by
-- default, so a no-login attacker could invoke them — including mutating ones (revert_receivables_invoice,
-- create_invoice_from_receivables, cron_unschedule_by_name, qms_record_separation_override,
-- convert_quote_to_orders). Phase 1 revoked TABLE grants but not function EXECUTE; this closes that vector.
-- NOTE: revoking from PUBLIC alone is insufficient — Supabase grants EXECUTE explicitly to anon/
-- authenticated, so we revoke from those roles directly.
--
-- KEPT anon EXECUTE (deliberately NOT in either bucket): the 8 RLS-helper functions referenced inside
-- policy expressions (is_staff_user, is_active_staff, get_staff_id, has_staff_role, current_customer_id,
-- cvp_is_active_staff, cvp_current_staff_id, cvp_is_training_admin) — revoking these would break anon's
-- ability to query public reference tables — plus get_pickup_locations_for_quote, which the public /quote
-- checkout calls. They return null/false for anon, so they leak nothing.
--
-- Bucket B (called by the admin UI as authenticated staff; gate internally): revoke anon, keep
--   authenticated + service_role.
-- Bucket C (edge-function / cron / trigger only — confirmed not called by the admin or vendor frontend
--   via a .rpc() grep of both repos): revoke anon AND authenticated, keep service_role (BYPASSRLS).
--
-- VERIFIED 2026-06-25 via dry-run + post-apply (has_function_privilege): helpers/public kept anon=true;
-- Bucket B anon=false/auth=true; Bucket C anon=false/auth=false; service_role=true throughout.
-- Live Chrome: /admin/calls (calls comms_list_call_logs) renders all 1,097 calls for staff.

do $$
declare
  r record;
  bucket_b text[] := array['comms_get_realtime_status','comms_list_customer_conversation','comms_get_customer_channel_state','comms_mark_customer_thread_read','comms_list_call_logs','comms_customers_sms_activity','comms_get_call_detail','comms_list_sms_templates','comms_list_call_labels','comms_add_call_note','comms_set_call_label','comms_list_all_sms_templates','comms_soft_delete_sms_template','comms_update_sms_template','comms_create_sms_template','comms_list_sms_threads','comms_get_sms_thread','comms_mark_sms_thread_read','comms_list_intelligence_reports','comms_get_intelligence_report','comms_get_transcription_stats','comms_upsert_call_label','comms_delete_call_label','get_staff_role','comms_list_admin_threads','get_vendor_activation_drip_stats'];
  bucket_c text[] := array['comms_create_intelligence_report','comms_get_active_rc_subscription','comms_get_auto_pending','comms_get_call_recording_info','comms_get_customer_unread_counts','comms_get_pending_transcriptions','comms_get_transcribed_calls_for_period','comms_link_customer','comms_list_customer_sms','comms_save_call_summary','comms_save_call_transcript','comms_update_intelligence_report','comms_upsert_rc_subscription','compute_order_profit_share','convert_quote_to_orders','create_invoice_from_receivables','cron_unschedule_by_name','cvp_arefs_advance_app_status','cvp_eligible_for_reference_request','cvp_linguist_trainings_for_vendor','cvp_record_training_completion','enforce_worm_no_delete','evidence_screen_switch_to_48h','get_unassigned_items','link_staff_user_on_auth_signup','log_hitl_status_change','qms_list_for_order','qms_list_screened_storage_paths','qms_record_separation_override','qms_resolve_language_id','qms_tg_sync_nda_signature','queue_ads_offline_conversion','revert_receivables_invoice','roster_reference_data','track_quote_status_change'];
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f' and p.prosecdef and p.proname = any(bucket_b) loop
    execute format('revoke execute on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind='f' and p.prosecdef and p.proname = any(bucket_c) loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
