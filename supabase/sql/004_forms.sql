-- Forms: remember which form a pending submission came from.
-- Submissions built by a form builder (station, device, ...) are saved by trusted server code,
-- so on approval they may write to any of that form's tables.
-- Run in the TEST project's SQL Editor. Safe to run more than once.
-- (If the RLS warning pop-up appears, choose to run WITHOUT enabling RLS.)

alter table private.pending_submissions add column if not exists form text;

select column_name, data_type from information_schema.columns
where table_schema = 'private' and table_name = 'pending_submissions'
order by ordinal_position;
