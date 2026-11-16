-- Organizations can update their existing data (with admin approval).
-- Run in the TEST project's SQL Editor. Safe to run more than once.
-- (If the RLS warning pop-up appears, choose to run WITHOUT enabling RLS.)
--
-- What changes:
--   access_requests      + kind: 'new' (add data) or 'edit' (update data they already have)
--   access_links         + kind, organization_id: an update link belongs to one organization,
--                          and can be used many times until it expires
--   pending_submissions  + kind, changes: an edit stores each change with its before and after values

alter table private.access_requests add column if not exists kind text not null default 'new';
alter table private.access_requests drop constraint if exists access_requests_kind_check;
alter table private.access_requests add constraint access_requests_kind_check check (kind in ('new', 'edit'));

alter table private.access_links add column if not exists kind text not null default 'new';
alter table private.access_links drop constraint if exists access_links_kind_check;
alter table private.access_links add constraint access_links_kind_check check (kind in ('new', 'edit'));
alter table private.access_links add column if not exists organization_id bigint
  references public."Organizations" ("OrganizationID") on delete cascade;
alter table private.access_links drop constraint if exists access_links_edit_needs_org;
alter table private.access_links add constraint access_links_edit_needs_org
  check (kind = 'new' or organization_id is not null);

alter table private.pending_submissions add column if not exists kind text not null default 'new';
alter table private.pending_submissions drop constraint if exists pending_submissions_kind_check;
alter table private.pending_submissions add constraint pending_submissions_kind_check check (kind in ('new', 'edit'));
alter table private.pending_submissions add column if not exists changes jsonb;
alter table private.pending_submissions drop constraint if exists pending_submissions_changes_check;
alter table private.pending_submissions add constraint pending_submissions_changes_check
  check (changes is null or jsonb_typeof(changes) = 'array');

-- Check: should list the new columns.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'private'
  and column_name in ('kind', 'organization_id', 'changes')
order by table_name, column_name;
