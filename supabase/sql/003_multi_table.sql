-- Day 4b: a submission can hold rows for several tables ("parts").
-- Run in the TEST project's SQL Editor. Safe to run more than once.
-- (If the RLS warning pop-up appears, choose to run WITHOUT enabling RLS.)

alter table private.pending_submissions add column if not exists parts jsonb;

-- Move any existing single-table submissions into the new format.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'private' and table_name = 'pending_submissions' and column_name = 'target_table') then
    update private.pending_submissions
    set parts = jsonb_build_array(jsonb_build_object('table', target_table, 'rows', rows))
    where parts is null;
  end if;
end $$;

alter table private.pending_submissions drop column if exists row_count;
alter table private.pending_submissions drop column if exists target_table;
alter table private.pending_submissions drop column if exists rows;
alter table private.pending_submissions add column if not exists row_count integer not null default 0;

update private.pending_submissions s
set row_count = (select coalesce(sum(jsonb_array_length(p -> 'rows')), 0) from jsonb_array_elements(s.parts) p)
where row_count = 0;

alter table private.pending_submissions alter column parts set not null;
alter table private.pending_submissions drop constraint if exists pending_submissions_parts_check;
alter table private.pending_submissions add constraint pending_submissions_parts_check check (jsonb_typeof(parts) = 'array');

select column_name, data_type from information_schema.columns
where table_schema = 'private' and table_name = 'pending_submissions'
order by ordinal_position;
