// Read-only tools for the portal's MCP server ("ask Claude about the data").
//
// Every tool only READS. Rows come through `read(table)`, which in production is the
// logged-in admin's Supabase client, so the database's own security rules (RLS) still apply.
// Tables are small, so each tool loads what it needs and joins in code (simple and predictable).

import { McpServer } from 'npm:@modelcontextprotocol/server@^2.4.0';
import { z } from 'npm:zod@^4.3.6';

export type Row = Record<string, unknown>;
export type ReadRows = (table: string) => Promise<Row[]>;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const MAX_LIST = 200;

// ---------------- small helpers ----------------

/** Loads each table at most once per request. */
function cached(read: ReadRows): ReadRows {
  const seen = new Map<string, Promise<Row[]>>();
  return (table) => {
    if (!seen.has(table)) seen.set(table, read(table));
    return seen.get(table)!;
  };
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const same = (a: unknown, b: unknown) => a !== null && a !== undefined && String(a) === String(b);
const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
const contains = (text: unknown, q: string) => str(text).toLowerCase().includes(q.toLowerCase());

function byId(rows: Row[], key: string): Map<string, Row> {
  return new Map(rows.map((r) => [str(r[key]), r]));
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

/** Tool result: JSON text for Claude to read. */
function reply(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] };
}

function notFound(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// ---------------- shared lookups ----------------

async function lookups(read: ReadRows) {
  const [projects, orgs, types, sites, obsTypes, roles] = await Promise.all([
    read('OrganizationProjects'), read('Organizations'), read('StationTypes'),
    read('StationSites'), read('ObservationTypes'), read('StationRoles'),
  ]);
  return {
    projects: byId(projects, 'ProjectID'),
    orgs: byId(orgs, 'OrganizationID'),
    types: byId(types, 'TypeID'),
    sites: byId(sites, 'SiteID'),
    obsTypes: byId(obsTypes, 'ObservationTypeID'),
    roles: byId(roles, 'RoleID'),
  };
}

type Lookups = Awaited<ReturnType<typeof lookups>>;

/** A short, readable summary of one station. */
function stationSummary(s: Row, l: Lookups) {
  const project = l.projects.get(str(s.ProjectID));
  return {
    id: num(s.StationID),
    name: str(s.StationName),
    code: str(s.StationCode) || null,
    project: project ? str(project.ProjectName) : null,
    organization: project ? str(l.orgs.get(str(project.OrganizationID))?.OrganizationName) || null : null,
    type: str(l.types.get(str(s.StationTypeID))?.TypeName) || null,
    site: str(l.sites.get(str(s.SiteID))?.SiteName) || null,
    active: s.IsActive ?? null,
    realTime: s.IsRealTime ?? null,
    latitude: num(s.Latitude),
    longitude: num(s.Longitude),
  };
}

// ---------------- the server ----------------

export function createServer(readRows: ReadRows): McpServer {
  const read = cached(readRows);
  const server = new McpServer(
    { name: 'sssc-data-portal', version: '1.0.0' },
    {
      instructions:
        'Read-only access to the SSSC Environmental Monitoring database (stations, projects, organizations, devices). ' +
        'Nothing can be changed through these tools. Start with `overview` for the big picture, ' +
        '`search_stations` to find stations, and `get_station` for full details on one.',
    },
  );

  server.registerTool(
    'overview',
    {
      title: 'Database overview',
      description: 'Totals for stations, projects, organizations and devices, plus station counts by project, type and organization.',
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async () => {
      const [stations, l, specs, links] = await Promise.all([
        read('Stations'), lookups(read), read('DeviceSpecifications'), read('StationsToSpecs'),
      ]);
      const summaries = stations.map((s) => stationSummary(s, l));
      return reply({
        totals: {
          stations: stations.length,
          activeStations: stations.filter((s) => s.IsActive === true).length,
          realTimeStations: stations.filter((s) => s.IsRealTime === true).length,
          projects: l.projects.size,
          organizations: l.orgs.size,
          sites: l.sites.size,
          deviceModels: specs.length,
          devicesInstalled: links.length,
        },
        stationsByProject: countBy(summaries, (s) => s.project ?? '(no project)'),
        stationsByOrganization: countBy(summaries, (s) => s.organization ?? '(no organization)'),
        stationsByType: countBy(summaries, (s) => s.type ?? '(no type)'),
      });
    },
  );

  server.registerTool(
    'search_stations',
    {
      title: 'Search stations',
      description:
        'Find stations. All filters are optional and combine with AND. Text filters match part of a name, ignoring case. ' +
        `Returns up to ${MAX_LIST} stations with project, organization, type, site, active flag and coordinates.`,
      inputSchema: z.object({
        text: z.string().optional().describe('Part of the station name or station code'),
        project: z.string().optional().describe('Part of the project name'),
        organization: z.string().optional().describe("Part of the name of the organization that runs the station's project"),
        type: z.string().optional().describe('Part of the station type, e.g. "weather"'),
        site: z.string().optional().describe('Part of the site name'),
        active: z.boolean().optional().describe('Only active (true) or inactive (false) stations'),
        realTime: z.boolean().optional().describe('Only real-time (true) or not real-time (false) stations'),
        limit: z.number().int().min(1).max(MAX_LIST).optional().describe(`Max results (default 50, max ${MAX_LIST})`),
      }),
      annotations: READ_ONLY,
    },
    async (f) => {
      const [stations, l] = await Promise.all([read('Stations'), lookups(read)]);
      const matches = stations
        .map((s) => ({ row: s, summary: stationSummary(s, l) }))
        .filter(({ row, summary: s }) =>
          (!f.text || contains(s.name, f.text) || contains(s.code, f.text)) &&
          (!f.project || contains(s.project, f.project)) &&
          (!f.organization || contains(s.organization, f.organization)) &&
          (!f.type || contains(s.type, f.type)) &&
          (!f.site || contains(s.site, f.site)) &&
          (f.active === undefined || row.IsActive === f.active) &&
          (f.realTime === undefined || row.IsRealTime === f.realTime))
        .map(({ summary }) => summary)
        .sort((a, b) => a.name.localeCompare(b.name));
      const limit = f.limit ?? 50;
      return reply({ matched: matches.length, showing: Math.min(limit, matches.length), stations: matches.slice(0, limit) });
    },
  );

  server.registerTool(
    'get_station',
    {
      title: 'Station details',
      description:
        'Everything about one station: project, organization, type, site, location, links, notes, what it observes, ' +
        'which organizations own/maintain it, its contacts, and the devices installed. Give `id`, or `name` (exact or partial).',
      inputSchema: z.object({
        id: z.number().int().optional().describe('StationID'),
        name: z.string().optional().describe('Station name (exact match preferred; partial works if only one station matches)'),
      }),
      annotations: READ_ONLY,
    },
    async ({ id, name }) => {
      if (id === undefined && !name) return notFound('Give a station id or name.');
      const stations = await read('Stations');
      let station: Row | undefined;
      if (id !== undefined) {
        station = stations.find((s) => same(s.StationID, id));
      } else {
        const exact = stations.filter((s) => str(s.StationName).toLowerCase() === name!.toLowerCase());
        const partial = exact.length ? exact : stations.filter((s) => contains(s.StationName, name!));
        if (partial.length > 1) {
          return notFound(
            `${partial.length} stations match "${name}": ` +
            partial.slice(0, 20).map((s) => `${str(s.StationName)} (id ${str(s.StationID)})`).join(', ') +
            '. Ask again with the id.',
          );
        }
        station = partial[0];
      }
      if (!station) return notFound(`No station found for ${id !== undefined ? `id ${id}` : `"${name}"`}.`);

      const sid = station.StationID;
      const [l, obs, orgRoles, stationContacts, contacts, specLinks, specs, makers, sensorLinks, sensors] = await Promise.all([
        lookups(read), read('StationObservations'), read('StationOrganizationRole'), read('StationContact'),
        read('Contacts'), read('StationsToSpecs'), read('DeviceSpecifications'), read('DeviceManufacturers'),
        read('StationsToSensors'), read('Sensors'),
      ]);
      const contactById = byId(contacts, 'ContactID');
      const specById = byId(specs, 'DeviceSpecificationID');
      const makerById = byId(makers, 'ManufacturerID');
      const sensorById = byId(sensors, 'SensorID');

      return reply({
        ...stationSummary(station, l),
        installDate: station.InstallDate ?? null,
        seasonal: station.IsSeasonal ?? null,
        updateInterval: str(station.UpdateInterval) || null,
        transmitTime: str(station.TransmitTime) || null,
        elevationFt: num(station['Elevation (FT)']),
        webLink: str(station.WebLink) || null,
        mesoWestLink: str(station.MesoWestLink) || null,
        notes: str(station.StationNotes) || null,
        observes: obs.filter((o) => same(o.StationID, sid)).map((o) => ({
          type: str(l.obsTypes.get(str(o.ObservationTypeID))?.ObservationType) || `#${str(o.ObservationTypeID)}`,
          quality: o.Quality ?? null,
        })),
        organizations: orgRoles.filter((r) => same(r.StationID, sid)).map((r) => ({
          role: str(l.roles.get(str(r.RoleID))?.RoleTitle) || `role #${str(r.RoleID)}`,
          organization: str(l.orgs.get(str(r.OrganizationID))?.OrganizationName) || `#${str(r.OrganizationID)}`,
        })),
        contacts: stationContacts.filter((c) => same(c.StationID, sid)).map((c) => {
          const person = contactById.get(str(c.ContactID));
          return {
            name: [str(person?.FirstName), str(person?.LastName)].filter(Boolean).join(' ') || null,
            email: str(person?.Email) || null,
            organization: str(l.orgs.get(str(person?.OrganizationID))?.OrganizationName) || null,
          };
        }),
        devices: specLinks.filter((d) => same(d.StationID, sid)).map((d) => {
          const spec = specById.get(str(d.DeviceSpecificationID));
          return {
            manufacturer: str(makerById.get(str(spec?.ManufacturerID))?.ManufacturerName) || null,
            modelNumber: str(spec?.ModelNumber) || null,
            modelName: str(spec?.ModelName) || null,
            serialNumber: str(d.SerialNumber) || null,
          };
        }),
        sensors: sensorLinks.filter((x) => same(x.StationID, sid)).map((x) => ({
          sensor: str(sensorById.get(str(x.SensorID))?.SensorName) || `#${str(x.SensorID)}`,
          count: num(x.Count),
          placementHeightMeters: num(x['PlacementHeight (Meters)']),
        })),
      });
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'Projects with their organization, dates, ongoing flag and number of stations. Optional filters.',
      inputSchema: z.object({
        text: z.string().optional().describe('Part of the project name'),
        organization: z.string().optional().describe('Part of the organization name'),
        ongoing: z.boolean().optional().describe('Only ongoing (true) or finished (false) projects'),
      }),
      annotations: READ_ONLY,
    },
    async (f) => {
      const [projects, orgs, stations] = await Promise.all([read('OrganizationProjects'), read('Organizations'), read('Stations')]);
      const orgById = byId(orgs, 'OrganizationID');
      const list = projects
        .map((p) => ({
          id: num(p.ProjectID),
          name: str(p.ProjectName),
          organization: str(orgById.get(str(p.OrganizationID))?.OrganizationName) || null,
          startDate: p.StartDate ?? null,
          endDate: p.EndDate ?? null,
          ongoing: p.IsOngoing ?? null,
          stations: stations.filter((s) => same(s.ProjectID, p.ProjectID)).length,
          notes: str(p.ProjectNotes) || null,
        }))
        .filter((p) =>
          (!f.text || contains(p.name, f.text)) &&
          (!f.organization || contains(p.organization, f.organization)) &&
          (f.ongoing === undefined || p.ongoing === f.ongoing))
        .sort((a, b) => a.name.localeCompare(b.name));
      return reply({ count: list.length, projects: list.slice(0, MAX_LIST) });
    },
  );

  server.registerTool(
    'list_organizations',
    {
      title: 'List organizations',
      description: 'Organizations with their type, number of projects, number of contacts, and station roles (owner, maintainer, ...).',
      inputSchema: z.object({
        text: z.string().optional().describe('Part of the organization name'),
        type: z.string().optional().describe('Organization type, e.g. "Tribal"'),
      }),
      annotations: READ_ONLY,
    },
    async (f) => {
      const [orgs, projects, contacts, orgRoles, roles] = await Promise.all([
        read('Organizations'), read('OrganizationProjects'), read('Contacts'), read('StationOrganizationRole'), read('StationRoles'),
      ]);
      const roleById = byId(roles, 'RoleID');
      const list = orgs
        .map((o) => ({
          id: num(o.OrganizationID),
          name: str(o.OrganizationName),
          type: str(o.OrganizationType) || null,
          projects: projects.filter((p) => same(p.OrganizationID, o.OrganizationID)).length,
          contacts: contacts.filter((c) => same(c.OrganizationID, o.OrganizationID)).length,
          stationRoles: countBy(
            orgRoles.filter((r) => same(r.OrganizationID, o.OrganizationID)),
            (r) => str(roleById.get(str(r.RoleID))?.RoleTitle) || `role #${str(r.RoleID)}`,
          ),
          notes: str(o.OrganizationNotes) || null,
        }))
        .filter((o) => (!f.text || contains(o.name, f.text)) && (!f.type || contains(o.type, f.type)))
        .sort((a, b) => a.name.localeCompare(b.name));
      return reply({ count: list.length, organizations: list.slice(0, MAX_LIST) });
    },
  );

  server.registerTool(
    'list_devices',
    {
      title: 'List device models',
      description: 'Device models (manufacturer, model number, model name) and the stations each one is installed at.',
      inputSchema: z.object({
        text: z.string().optional().describe('Part of the manufacturer, model number or model name'),
      }),
      annotations: READ_ONLY,
    },
    async (f) => {
      const [specs, makers, links, stations] = await Promise.all([
        read('DeviceSpecifications'), read('DeviceManufacturers'), read('StationsToSpecs'), read('Stations'),
      ]);
      const makerById = byId(makers, 'ManufacturerID');
      const stationById = byId(stations, 'StationID');
      const list = specs
        .map((d) => ({
          id: num(d.DeviceSpecificationID),
          manufacturer: str(makerById.get(str(d.ManufacturerID))?.ManufacturerName) || null,
          modelNumber: str(d.ModelNumber) || null,
          modelName: str(d.ModelName) || null,
          installedAt: links.filter((x) => same(x.DeviceSpecificationID, d.DeviceSpecificationID)).map((x) => ({
            station: str(stationById.get(str(x.StationID))?.StationName) || `#${str(x.StationID)}`,
            serialNumber: str(x.SerialNumber) || null,
          })),
        }))
        .filter((d) => !f.text || contains(d.manufacturer, f.text) || contains(d.modelNumber, f.text) || contains(d.modelName, f.text))
        .sort((a, b) => `${a.manufacturer} ${a.modelNumber}`.localeCompare(`${b.manufacturer} ${b.modelNumber}`));
      return reply({ count: list.length, devices: list.slice(0, MAX_LIST) });
    },
  );

  const CHECKS = ['elevation', 'installDate', 'site', 'stationCode', 'primaryOwner', 'contact', 'observationType', 'device'] as const;

  server.registerTool(
    'find_missing_info',
    {
      title: 'Find stations with missing info',
      description:
        'Data-quality check: lists stations that are missing something. Checks: ' + CHECKS.join(', ') +
        '. Leave `check` empty to run all checks.',
      inputSchema: z.object({
        check: z.enum(CHECKS).optional().describe('Run only this check'),
        activeOnly: z.boolean().optional().describe('Only look at active stations'),
      }),
      annotations: READ_ONLY,
    },
    async ({ check, activeOnly }) => {
      const [stations, orgRoles, stationContacts, obs, specLinks] = await Promise.all([
        read('Stations'), read('StationOrganizationRole'), read('StationContact'), read('StationObservations'), read('StationsToSpecs'),
      ]);
      const ids = (rows: Row[], filter: (r: Row) => boolean = () => true) =>
        new Set(rows.filter(filter).map((r) => str(r.StationID)));
      const owners = ids(orgRoles, (r) => same(r.RoleID, 1));
      const withContact = ids(stationContacts);
      const withObs = ids(obs);
      const withDevice = ids(specLinks);
      const missing: Record<(typeof CHECKS)[number], (s: Row) => boolean> = {
        elevation: (s) => !has(s['Elevation (FT)']),
        installDate: (s) => !has(s.InstallDate),
        site: (s) => !has(s.SiteID),
        stationCode: (s) => !has(s.StationCode),
        primaryOwner: (s) => !owners.has(str(s.StationID)),
        contact: (s) => !withContact.has(str(s.StationID)),
        observationType: (s) => !withObs.has(str(s.StationID)),
        device: (s) => !withDevice.has(str(s.StationID)),
      };
      const pool = stations.filter((s) => !activeOnly || s.IsActive === true);
      const result: Record<string, { count: number; stations: { id: number | null; name: string }[] }> = {};
      for (const c of check ? [check] : CHECKS) {
        const hits = pool.filter(missing[c]).map((s) => ({ id: num(s.StationID), name: str(s.StationName) }));
        result[c] = { count: hits.length, stations: hits.slice(0, MAX_LIST) };
      }
      return reply({ stationsChecked: pool.length, missing: result });
    },
  );

  return server;
}
