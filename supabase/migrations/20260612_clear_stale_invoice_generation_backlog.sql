-- Clear the stale invoice_generation_queue backlog before restoring the
-- process-invoice-queue edge function (dead since 2026-02-02, bundle lost).
-- 314 orders queued Feb-Jun 2026 were never auto-invoiced; most were invoiced
-- manually in the meantime, so reprocessing would create duplicates.
-- User decision 2026-06-12: mark stale rows failed, restore for new orders only.
-- ('skipped' is not in the status CHECK constraint, hence 'failed' + message.)

UPDATE invoice_generation_queue
SET status = 'failed',
    error_message = 'Stale backlog cleared 2026-06-12 before function restore (processor dead since 2026-02-02); invoice manually if missing',
    processed_at = now()
WHERE status = 'pending';
