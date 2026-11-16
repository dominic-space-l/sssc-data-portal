// The four data forms, described as lists of fields.
// One component (DataForm) draws any of them, so adding or changing a field only means editing this file.
// Field keys must match what the server's form builders read (supabase/functions/_shared/forms.ts).

import { FormName, FormOptions } from '../services/portal-api';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'number' | 'date' | 'textarea' | 'checkbox' | 'select' | 'suggest';
  required?: boolean;
  /** For select / suggest: which dropdown list to use. */
  options?: keyof FormOptions;
  /** For number: 'any' allows decimals. */
  step?: string;
  hint?: string;
}

export interface Section { title: string; fields: FieldDef[]; }
export interface FormDef { name: FormName | string; title: string; description: string; sections: Section[]; }

const contact = (title = 'Contact'): Section => ({
  title,
  fields: [
    { key: 'ContactEmail', label: 'Email', type: 'email', required: true },
    { key: 'ContactFirstName', label: 'First name', type: 'text', required: true },
    { key: 'ContactLastName', label: 'Last name', type: 'text', required: true },
    { key: 'ContactNotes', label: 'Notes', type: 'textarea' },
  ],
});

export const FORM_DEFS: Record<FormName, FormDef> = {
  organization: {
    name: 'organization',
    title: 'New organization',
    description: 'Add an organization and its main contact.',
    sections: [
      {
        title: 'Organization',
        fields: [
          { key: 'OrganizationName', label: 'Organization name', type: 'text', required: true },
          { key: 'OrganizationType', label: 'Organization type', type: 'select', options: 'organizationTypes', required: true },
          { key: 'OrganizationNotes', label: 'Notes', type: 'textarea' },
        ],
      },
      contact(),
    ],
  },

  project: {
    name: 'project',
    title: 'New project',
    description: 'Add a project run by an organization.',
    sections: [
      {
        title: 'Project',
        fields: [
          { key: 'OrganizationID', label: 'Organization', type: 'select', options: 'organizations', required: true },
          { key: 'ProjectName', label: 'Project name', type: 'text', required: true },
          { key: 'StartDate', label: 'Start date', type: 'date' },
          { key: 'EndDate', label: 'End date', type: 'date' },
          { key: 'IsOngoing', label: 'Ongoing', type: 'checkbox' },
          { key: 'ProjectNotes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
  },

  station: {
    name: 'station',
    title: 'New station',
    description: 'Add a monitoring station, who runs it, and a contact.',
    sections: [
      {
        title: 'Station',
        fields: [
          { key: 'StationName', label: 'Station name', type: 'text', required: true },
          { key: 'StationCode', label: 'Station code', type: 'text' },
          { key: 'ProjectID', label: 'Project', type: 'select', options: 'projects', required: true },
          { key: 'StationTypeID', label: 'Station type', type: 'select', options: 'stationTypes', required: true },
          { key: 'ObservationTypeID', label: 'Observation type', type: 'select', options: 'observationTypes', required: true },
          { key: 'SiteID', label: 'Site', type: 'select', options: 'sites' },
          { key: 'InstallDate', label: 'Install date', type: 'date' },
          { key: 'IsActive', label: 'Active', type: 'checkbox' },
          { key: 'IsRealTime', label: 'Real-time', type: 'checkbox' },
          { key: 'IsSeasonal', label: 'Seasonal', type: 'checkbox' },
          { key: 'UpdateIntervalMinutes', label: 'Update interval (minutes)', type: 'number' },
          { key: 'TransmitTimeMinutes', label: 'Transmit time (minutes)', type: 'number' },
          { key: 'StationNotes', label: 'Notes', type: 'textarea' },
        ],
      },
      {
        title: 'Location',
        fields: [
          { key: 'Longitude', label: 'Longitude', type: 'number', step: 'any', required: true, hint: 'For example -135.33' },
          { key: 'Latitude', label: 'Latitude', type: 'number', step: 'any', required: true, hint: 'For example 57.05' },
          { key: 'ElevationFt', label: 'Elevation (feet, whole number)', type: 'number' },
        ],
      },
      {
        title: 'Links',
        fields: [
          { key: 'WebLink', label: 'Web link', type: 'url' },
          { key: 'MesoWestLink', label: 'MesoWest link', type: 'url' },
        ],
      },
      {
        title: 'Organizations',
        fields: [
          { key: 'PrimaryOwnerID', label: 'Primary owner', type: 'select', options: 'organizations', required: true },
          { key: 'SecondaryOwnerID', label: 'Secondary owner', type: 'select', options: 'organizations' },
          { key: 'MaintainerID', label: 'Maintainer', type: 'select', options: 'organizations' },
          { key: 'DataProviderID', label: 'Data provider', type: 'select', options: 'organizations' },
        ],
      },
      contact('Station contact'),
    ],
  },

  device: {
    name: 'device',
    title: 'New device',
    description: 'Add a device model, and optionally link it to a station.',
    sections: [
      {
        title: 'Manufacturer',
        fields: [
          { key: 'ManufacturerName', label: 'Manufacturer', type: 'suggest', options: 'manufacturers', required: true,
            hint: 'Pick one from the list, or type a new name' },
          { key: 'ManufacturerNotes', label: 'Manufacturer notes', type: 'textarea', hint: 'Only saved for a new manufacturer' },
        ],
      },
      {
        title: 'Model',
        fields: [
          { key: 'ModelNumber', label: 'Model number', type: 'text', required: true },
          { key: 'ModelName', label: 'Model name', type: 'text', required: true },
          { key: 'ModelNotes', label: 'Model notes', type: 'textarea' },
        ],
      },
      {
        title: 'Station (optional)',
        fields: [
          { key: 'StationID', label: 'Station', type: 'select', options: 'stations' },
          { key: 'SerialNumber', label: 'Serial number', type: 'text', hint: 'Needs a station' },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Edit forms: outside organizations updating data they already have (update links).
// Field keys must match the server's edit builders (supabase/functions/_shared/edits.ts).
// ---------------------------------------------------------------------------

export const EDIT_DEFS = {
  station: {
    name: 'station',
    title: 'Station details',
    description: 'Change what needs updating, then send it for review.',
    sections: [
      {
        title: 'Station',
        fields: [
          { key: 'StationName', label: 'Station name', type: 'text', required: true },
          { key: 'StationCode', label: 'Station code', type: 'text' },
          { key: 'StationTypeID', label: 'Station type', type: 'select', options: 'stationTypes', required: true },
          { key: 'SiteID', label: 'Site', type: 'select', options: 'sites' },
          { key: 'InstallDate', label: 'Install date', type: 'date' },
          { key: 'IsActive', label: 'Active', type: 'checkbox' },
          { key: 'IsRealTime', label: 'Real-time', type: 'checkbox' },
          { key: 'IsSeasonal', label: 'Seasonal', type: 'checkbox' },
          { key: 'UpdateIntervalMinutes', label: 'Update interval (minutes)', type: 'number' },
          { key: 'TransmitTimeMinutes', label: 'Transmit time (minutes)', type: 'number' },
          { key: 'StationNotes', label: 'Notes', type: 'textarea' },
        ],
      },
      {
        title: 'Location',
        fields: [
          { key: 'Longitude', label: 'Longitude', type: 'number', step: 'any', required: true },
          { key: 'Latitude', label: 'Latitude', type: 'number', step: 'any', required: true },
          { key: 'ElevationFt', label: 'Elevation (feet, whole number)', type: 'number' },
        ],
      },
      {
        title: 'Links',
        fields: [
          { key: 'WebLink', label: 'Web link', type: 'url' },
          { key: 'MesoWestLink', label: 'MesoWest link', type: 'url' },
        ],
      },
    ],
  },

  station_contact: {
    name: 'station_contact',
    title: 'Change the station contact',
    description: 'Enter the new contact person. They replace the current contact for this station. ' +
      'If someone with this email is already saved, they are reused.',
    sections: [
      {
        title: 'New contact',
        fields: [
          { key: 'ContactEmail', label: 'Email', type: 'email', required: true },
          { key: 'ContactFirstName', label: 'First name', type: 'text', required: true },
          { key: 'ContactLastName', label: 'Last name', type: 'text', required: true },
          { key: 'ContactNotes', label: 'Notes', type: 'textarea', hint: 'Only saved for a new person' },
        ],
      },
    ],
  },

  contact: {
    name: 'contact',
    title: 'Contact details',
    description: 'Update this person\'s name, email or notes.',
    sections: [
      {
        title: 'Contact',
        fields: [
          { key: 'Email', label: 'Email', type: 'email', required: true },
          { key: 'FirstName', label: 'First name', type: 'text', required: true },
          { key: 'LastName', label: 'Last name', type: 'text', required: true },
          { key: 'ContactNotes', label: 'Notes', type: 'textarea' },
        ],
      },
    ],
  },

  device: {
    name: 'device',
    title: 'Device',
    description: '',
    sections: [
      {
        title: 'Device at this station',
        fields: [
          { key: 'SerialNumber', label: 'Serial number', type: 'text' },
          { key: 'Remove', label: 'Remove this device from the station', type: 'checkbox' },
        ],
      },
    ],
  },

  sensor: {
    name: 'sensor',
    title: 'Sensor',
    description: '',
    sections: [
      {
        title: 'Sensor at this station',
        fields: [
          { key: 'Count', label: 'How many', type: 'number' },
          { key: 'PlacementHeightMeters', label: 'Placement height (meters)', type: 'number', step: 'any' },
          { key: 'PlacementNotes', label: 'Placement notes', type: 'textarea' },
          { key: 'Remove', label: 'Remove this sensor from the station', type: 'checkbox' },
        ],
      },
    ],
  },
} satisfies Record<string, FormDef>;

export type EditName = keyof typeof EDIT_DEFS;
