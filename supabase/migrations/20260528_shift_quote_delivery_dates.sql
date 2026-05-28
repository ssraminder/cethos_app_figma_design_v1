-- Re-project a quote's promised delivery dates from "today" using the same
-- business-day budget that was originally promised. Locks once the quote has
-- converted to an order (converted_to_order_id IS NOT NULL).
--
-- Standard + rush each get their own business-day count, computed between
-- quote.created_at and the original promised date in America/Edmonton local
-- time. The shifted dates are produced by the existing
-- calculate_delivery_date() / is_business_day() pair, so any rows added to
-- the holidays table are honored transparently.

CREATE OR REPLACE FUNCTION public.shift_quote_delivery_dates(
  p_quote_id uuid,
  p_region varchar DEFAULT 'CA-AB'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_created_at      timestamptz;
  v_std_orig        date;
  v_rush_orig       date;
  v_converted_id    uuid;
  v_issue_date_local date;
  v_today_local     date;
  v_cursor          date;
  v_std_bd          integer := 0;
  v_rush_bd         integer := 0;
  v_std_shifted     date;
  v_rush_shifted    date;
BEGIN
  SELECT created_at, promised_delivery_date, promised_delivery_date_rush, converted_to_order_id
    INTO v_created_at, v_std_orig, v_rush_orig, v_converted_id
    FROM quotes
    WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'quote_not_found');
  END IF;

  -- Already an order — dates are locked as promised.
  IF v_converted_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'standard_delivery', v_std_orig,
      'rush_delivery',     v_rush_orig,
      'shifted',           false,
      'reason',            'converted_to_order'
    );
  END IF;

  v_issue_date_local := (v_created_at AT TIME ZONE 'America/Edmonton')::date;
  v_today_local      := (now()        AT TIME ZONE 'America/Edmonton')::date;

  -- Nothing to shift if "today" is on or before the original issue date.
  IF v_today_local <= v_issue_date_local THEN
    RETURN jsonb_build_object(
      'standard_delivery', v_std_orig,
      'rush_delivery',     v_rush_orig,
      'shifted',           false,
      'reason',            'not_yet_issued'
    );
  END IF;

  -- Count business days between original issue date and original standard delivery.
  IF v_std_orig IS NOT NULL AND v_std_orig > v_issue_date_local THEN
    v_cursor := v_issue_date_local;
    WHILE v_cursor < v_std_orig LOOP
      v_cursor := v_cursor + INTERVAL '1 day';
      IF public.is_business_day(v_cursor, p_region) THEN
        v_std_bd := v_std_bd + 1;
      END IF;
    END LOOP;
    v_std_shifted := public.calculate_delivery_date(now(), v_std_bd, p_region);
  ELSE
    v_std_shifted := v_std_orig;
  END IF;

  -- Same for rush.
  IF v_rush_orig IS NOT NULL AND v_rush_orig > v_issue_date_local THEN
    v_cursor := v_issue_date_local;
    WHILE v_cursor < v_rush_orig LOOP
      v_cursor := v_cursor + INTERVAL '1 day';
      IF public.is_business_day(v_cursor, p_region) THEN
        v_rush_bd := v_rush_bd + 1;
      END IF;
    END LOOP;
    v_rush_shifted := public.calculate_delivery_date(now(), v_rush_bd, p_region);
  ELSE
    v_rush_shifted := v_rush_orig;
  END IF;

  RETURN jsonb_build_object(
    'standard_delivery',      v_std_shifted,
    'rush_delivery',          v_rush_shifted,
    'standard_business_days', v_std_bd,
    'rush_business_days',     v_rush_bd,
    'original_issue_date',    v_issue_date_local,
    'today_local',            v_today_local,
    'shifted',                true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.shift_quote_delivery_dates(uuid, varchar) FROM anon;
GRANT EXECUTE ON FUNCTION public.shift_quote_delivery_dates(uuid, varchar) TO authenticated, service_role;
