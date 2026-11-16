-- pgTAP tests for authentication A1: the auth_private schema, the admins list, and
-- auth_private.is_admin().
--
-- Role: checks that nothing in auth_private can be reached through the API, and that
-- is_admin() is true only for users listed in auth_private.admins.
--
-- Usage: npm run db:test   (or: npx supabase test db). It runs in a transaction and
-- rolls back, so it leaves no changes behind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------------------

select has_schema('auth_private', 'the auth_private schema exists');

select set_eq(
  $$select tablename::text from pg_tables where schemaname = 'auth_private'$$,
  array['access_links', 'access_requests', 'admins', 'pending_submissions'],
  'auth_private holds exactly the four authentication tables'
);

select is_empty(
  $$select tablename from pg_tables where schemaname = 'auth_private' and not rowsecurity$$,
  'every table in auth_private has row-level security enabled'
);

select is_empty(
  $$select c.relname, r.rolname
    from pg_class c
    cross join (values ('anon'), ('authenticated')) r(rolname)
    where c.relnamespace = 'auth_private'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and (has_table_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
           or has_any_column_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))$$,
  'anon and authenticated hold no privilege on any table or sequence in auth_private'
);

select is_empty(
  $$select policyname from pg_policies where schemaname = 'auth_private'$$,
  'auth_private has no policies (nothing is meant to be read through the API)'
);

select ok(
  not has_schema_privilege('anon', 'auth_private', 'USAGE'),
  'anon has no USAGE on auth_private'
);

select ok(
  not has_function_privilege('anon', 'auth_private.is_admin()', 'EXECUTE'),
  'anon cannot execute is_admin()'
);

select ok(
  has_function_privilege('authenticated', 'auth_private.is_admin()', 'EXECUTE'),
  'authenticated can execute is_admin() (policies need it)'
);

select is(
  (select prosecdef from pg_proc where oid = 'auth_private.is_admin()'::regprocedure),
  true,
  'is_admin() is security definer'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'auth_private.is_admin()'::regprocedure),
  'is_admin() pins an empty search_path'
);

-- A table created later in auth_private gets no grants by default.
create table auth_private.a1_probe (id int);
select ok(
  not has_table_privilege('authenticated', 'auth_private.a1_probe', 'SELECT'),
  'a new table in auth_private is not readable by authenticated by default'
);
drop table auth_private.a1_probe;

-- ---------------------------------------------------------------------------------------
-- Behavior
-- ---------------------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@a1.test'),
  ('00000000-0000-0000-0000-00000000a002', 'someone@a1.test');
insert into auth_private.admins (user_id, note)
values ('00000000-0000-0000-0000-00000000a001', 'test admin');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';
select is(auth_private.is_admin(), true, 'is_admin() is true for a listed admin');

select throws_ok(
  $$select 1 from auth_private.admins limit 1$$,
  '42501', null,
  'even an admin cannot read auth_private.admins through the API'
);

set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a002", "role": "authenticated"}';
select is(auth_private.is_admin(), false, 'is_admin() is false for a signed-in user who is not listed');

select throws_ok(
  $$insert into auth_private.admins (user_id) values ('00000000-0000-0000-0000-00000000a002')$$,
  '42501', null,
  'a signed-in user cannot add themselves to the admins list'
);

set local request.jwt.claims = '{}';
select is(auth_private.is_admin(), false, 'is_admin() is false with no user');

reset role;

-- Deleting the user removes them from the admins list.
delete from auth.users where id = '00000000-0000-0000-0000-00000000a001';
select is_empty(
  $$select 1 from auth_private.admins where user_id = '00000000-0000-0000-0000-00000000a001'$$,
  'deleting a user removes them from auth_private.admins'
);

select * from finish();
rollback;
