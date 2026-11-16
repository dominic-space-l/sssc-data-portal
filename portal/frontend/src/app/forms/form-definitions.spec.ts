/**
 * @fileoverview Checks the form definitions stay consistent: unique field keys, real dropdown
 * lists, and the single "main" form's required fields (they must match the server's builder in
 * supabase/functions/_shared/forms.ts).
 *
 * Usage: `npm test` from the repo root (Vitest via `ng test`).
 */

import { EDIT_DEFS, FORM_DEFS, FormDef } from './form-definitions';

const OPTION_LISTS = [
  'organizations',
  'projects',
  'stationTypes',
  'observationTypes',
  'sites',
  'stations',
  'manufacturers',
  'sensors',
  'measurementUnits',
  'organizationTypes',
];

const allDefs: FormDef[] = [...Object.values(FORM_DEFS), ...Object.values(EDIT_DEFS)];

describe('form definitions', () => {
  it.each(allDefs.map((d) => [d.name, d] as const))('%s has unique field keys', (_name, def) => {
    const keys = def.sections.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every dropdown names a list the server sends', () => {
    for (const def of allDefs) {
      for (const field of def.sections.flatMap((s) => s.fields)) {
        if (field.type === 'select' || field.type === 'suggest') {
          expect(OPTION_LISTS).toContain(field.options);
        }
      }
    }
  });

  it("the single form's required fields match the server's", () => {
    const required = FORM_DEFS.main.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.required)
      .map((f) => f.key)
      .sort();
    expect(required).toEqual(
      [
        'ContactEmail',
        'ContactFirstName',
        'ContactLastName',
        'Latitude',
        'Longitude',
        'ObservationTypeID',
        'OrganizationName',
        'OrganizationType',
        'ProjectName',
        'SensorName',
        'SensorObservation',
        'StationName',
        'StationTypeName',
      ].sort(),
    );
  });
});
