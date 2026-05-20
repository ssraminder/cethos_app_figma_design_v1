-- ============================================================================
-- v_unified_messages: resolve customer_id via customer_conversations
--
-- Staff-outbound messages persisted by send-staff-message link to a
-- customer_conversations row (which knows the customer_id) but they leave
-- sender_customer_id, quote_id, and order_id null. The original view's
-- coalesce(sender_customer_id, q.customer_id, o.customer_id) returned null
-- for those, hiding every staff-outbound message from the unified inbox.
--
-- Add customer_conversations as a fourth fallback path so staff-outbound
-- messages surface immediately.
-- ============================================================================

drop view if exists public.v_unified_messages;

create view public.v_unified_messages as
select
  cm.id::uuid as id,
  coalesce(
    cm.sender_customer_id,
    q.customer_id,
    o.customer_id,
    cc.customer_id
  ) as customer_id,
  cm.conversation_id::text as thread_id,
  (case
    when cm.source = 'email' then 'email'
    when cm.source = 'inapp' then 'inapp'
    else coalesce(cm.source, 'inapp')
  end)::text as channel,
  (case
    when cm.sender_type = 'customer' then 'inbound'
    when cm.sender_type = 'staff' then 'outbound'
    when cm.sender_type = 'system' then 'system'
    else cm.sender_type
  end)::text as direction,
  cm.message_text::text as body,
  cm.created_at as occurred_at,
  cm.read_by_staff_at as read_at,
  cm.sender_staff_id as staff_user_id,
  cm.sender_customer_id as sender_customer_id,
  cm.quote_id as quote_id,
  cm.order_id as order_id,
  cm.metadata as metadata,
  null::text as peer_phone_e164,
  null::text as template_key,
  null::text as status,
  cm.email_message_id::text as external_id
from public.conversation_messages cm
left join public.quotes q on q.id = cm.quote_id
left join public.orders o on o.id = cm.order_id
left join public.customer_conversations cc on cc.id = cm.conversation_id

union all

select
  sm.id,
  sm.customer_id,
  coalesce(
    case when sm.direction = 'inbound' then sm.from_number_e164 else sm.to_number_e164 end,
    case when sm.direction = 'inbound' then sm.from_number else sm.to_number end
  )::text as thread_id,
  'sms'::text as channel,
  sm.direction::text as direction,
  sm.body::text as body,
  coalesce(sm.received_at, sm.sent_at, sm.created_at) as occurred_at,
  sm.read_at,
  sm.staff_user_id,
  null::uuid as sender_customer_id,
  null::uuid as quote_id,
  null::uuid as order_id,
  jsonb_build_object(
    'rc_message_id', sm.rc_message_id,
    'rc_conversation_id', sm.rc_conversation_id,
    'template_key', sm.template_key,
    'call_log_id', sm.call_log_id
  ) as metadata,
  coalesce(
    case when sm.direction = 'inbound' then sm.from_number_e164 else sm.to_number_e164 end,
    case when sm.direction = 'inbound' then sm.from_number else sm.to_number end
  )::text as peer_phone_e164,
  sm.template_key::text as template_key,
  sm.status::text as status,
  sm.rc_message_id::text as external_id
from comms.sms_messages sm
where sm.customer_id is not null;

grant select on public.v_unified_messages to authenticated, service_role;
