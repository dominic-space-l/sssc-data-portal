-- S4: the private masking schema and map_private.mask_point.
--
-- Role: step S4 of documentation/map/supabase_plan.md (map 0.7.0). mask_point moves a
-- station's point 250-500 m in a direction picked by HMAC(Vault secret, station id), so
-- the public map never sees true coordinates. The same id always lands in the same
-- place, so the offset can't be averaged away. Only S5's map_stations will call it.
--
-- Usage: applied by `npm run db:reset` locally and `npx supabase db push` for the hosted
-- project. Tests: supabase/tests/04_mask_point.test.sql.
--
-- Prerequisite: the secret is NOT created here. On the hosted project, create it once,
-- by hand, in the SQL editor:
--   select vault.create_secret('<openssl rand -base64 48>', 'map_location_mask_secret');
-- Changing it later moves every marker on the map. Locally, supabase/seed.sql creates a
-- throwaway one. Until the secret exists, mask_point raises instead of returning a point.
--
-- map_private isn't in the API's exposed schemas (config.toml [api] schemas, and
-- Settings -> API -> Exposed schemas on the hosted project), so it can't be called over
-- HTTP. Its usage and execute privileges are revoked from every API role as well.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists map_private;
revoke all on schema map_private from public, anon, authenticated;
comment on schema map_private is
  'Internal helpers for the public map. Not exposed through the API; no API role may use it.';

create or replace function map_private.mask_point(
  p_id bigint, p_lon numeric, p_lat numeric,
  out lon numeric, out lat numeric)
language plpgsql stable security definer set search_path = ''
as $$
declare
  -- The radius is fixed here, not a parameter, so no caller can ask for a smaller one.
  -- Changing it moves every marker.
  c_min_m constant double precision := 250;
  c_max_m constant double precision := 500;
  v_secret text;
  v_hash bytea;
  v_azimuth double precision;
  v_dist double precision;
  v_point extensions.geometry;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'map_location_mask_secret';
  if v_secret is null then
    raise exception 'location masking is not configured' using errcode = 'P0001';
  end if;

  v_hash := extensions.hmac(p_id::text, v_secret, 'sha256');
  -- Azimuth in radians, clockwise from north, as ST_Project expects.
  v_azimuth := ((get_byte(v_hash, 0) << 8) | get_byte(v_hash, 1)) / 65536.0 * 2 * pi();
  v_dist := c_min_m + ((get_byte(v_hash, 2) << 8) | get_byte(v_hash, 3)) / 65535.0 * (c_max_m - c_min_m);

  v_point := extensions.st_project(
      extensions.st_setsrid(
        extensions.st_makepoint(p_lon::double precision, p_lat::double precision), 4326
      )::extensions.geography,
      v_dist, v_azimuth
    )::extensions.geometry;

  -- 4 decimal places is about 11 m, which can push the point slightly outside 250-500 m.
  lon := round(extensions.st_x(v_point)::numeric, 4);
  lat := round(extensions.st_y(v_point)::numeric, 4);
end;
$$;

revoke all on function map_private.mask_point(bigint, numeric, numeric) from public, anon, authenticated;
comment on function map_private.mask_point(bigint, numeric, numeric) is
  'Moves a point 250-500 m in a direction derived from HMAC(Vault secret, id). Stable per id.';
