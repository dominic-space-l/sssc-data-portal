// The data forms, described as lists of fields: the single combined form ("main", for admins and
// outside organizations) and the four separate admin forms.
// One component (DataForm) draws any of them, so adding or changing a field only means editing this file.
// Field keys must match what the server's form builders read (supabase/functions/_shared/forms.ts).

import { FormName, FormOptions } from '../services/portal-api';

export interface FieldDef {
  key: string;
  label: string;
  type:
    'text' | 'email' | 'url' | 'number' | 'date' | 'textarea' | 'checkbox' | 'select' | 'suggest';
  required?: boolean;
  /** For select / suggest: which dropdown list to use. */
  options?: keyof FormOptions;
  /** For number: 'any' allows decimals. */
  step?: string;
  hint?: string;
}

export interface Section {
  title: string;
  /** Optional one-line explanation shown under the section title. */
  description?: string;
  fields: FieldDef[];
}
export interface FormDef {
  name: FormName | string;
  title: string;
  description: string;
  sections: Section[];
}

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
  // Elias's combined "Enter Information" form (Elias-new-branch, server/views/input_form_main.pug).
  main: {
    name: 'main',
    title: 'Enter information',
    description:
      'Everything about a monitoring station in one form. Names you type are matched to what is ' +
      'already saved (ignoring capital letters); anything new is added.',
    sections: [
      {
        title: 'Contact',
        description: 'Who we can contact to ask questions.',
        fields: [
          { key: 'ContactEmail', label: 'Contact email', type: 'email', required: true },
          { key: 'ContactFirstName', label: 'Contact first name', type: 'text', required: true },
          { key: 'ContactLastName', label: 'Contact last name', type: 'text', required: true },
          { key: 'ContactNotes', label: 'Contact notes', type: 'textarea' },
        ],
      },
      {
        title: 'Organization',
        description: 'Which organization you are from.',
        fields: [
          {
            key: 'OrganizationName',
            label: 'Organization name',
            type: 'suggest',
            options: 'organizations',
            required: true,
            hint: 'Pick one from the list, or type a new name',
          },
          {
            key: 'OrganizationType',
            label: 'Organization type',
            type: 'select',
            options: 'organizationTypes',
            required: true,
          },
          { key: 'OrganizationNotes', label: 'Organization notes', type: 'textarea' },
        ],
      },
      {
        title: 'Project',
        description: 'General project information.',
        fields: [
          {
            key: 'ProjectName',
            label: 'Project name',
            type: 'suggest',
            options: 'projects',
            required: true,
            hint: 'Pick one of your projects, or type a new name',
          },
          { key: 'StartDate', label: 'Begin date', type: 'date' },
          { key: 'EndDate', label: 'End date', type: 'date' },
          { key: 'IsOngoing', label: 'Ongoing', type: 'checkbox' },
          { key: 'ProjectNotes', label: 'Project notes', type: 'textarea' },
        ],
      },
      {
        title: 'Station',
        description: 'What the station is monitoring.',
        fields: [
          { key: 'StationName', label: 'Station name', type: 'text', required: true },
          {
            key: 'ObservationTypeID',
            label: 'Observation type',
            type: 'select',
            options: 'observationTypes',
            required: true,
          },
          {
            key: 'StationTypeName',
            label: 'Station type',
            type: 'suggest',
            options: 'stationTypes',
            required: true,
            hint: 'Pick one from the list, or type a new type',
          },
          {
            key: 'StationTypeNotes',
            label: 'Station type notes',
            type: 'textarea',
            hint: 'Only saved for a new station type',
          },
          {
            key: 'Longitude',
            label: 'Longitude',
            type: 'number',
            step: 'any',
            required: true,
            hint: 'For example -135.33',
          },
          {
            key: 'Latitude',
            label: 'Latitude',
            type: 'number',
            step: 'any',
            required: true,
            hint: 'For example 57.05',
          },
          { key: 'StationCode', label: 'Station code', type: 'text' },
          { key: 'InstallDate', label: 'Install date', type: 'date' },
          { key: 'IsActive', label: 'Active', type: 'checkbox' },
          {
            key: 'IsRealTime',
            label: 'Reports close to real time (not periodic packages of data)',
            type: 'checkbox',
          },
          { key: 'IsSeasonal', label: 'Seasonal', type: 'checkbox' },
          { key: 'UpdateIntervalMinutes', label: 'Update interval (minutes)', type: 'number' },
          { key: 'TransmitTimeMinutes', label: 'Transmit time (minutes)', type: 'number' },
          { key: 'ElevationFt', label: 'Relative elevation (feet, whole number)', type: 'number' },
          { key: 'WebLink', label: 'Web link', type: 'url' },
          { key: 'MesoWestLink', label: 'MesoWest link', type: 'url' },
          { key: 'StationNotes', label: 'Station notes', type: 'textarea' },
        ],
      },
      {
        title: 'Other organizations',
        description: 'Optional. Each one must already be saved (or be your own organization).',
        fields: [
          {
            key: 'SecondaryOwnerName',
            label: 'Secondary owner',
            type: 'suggest',
            options: 'organizations',
          },
          { key: 'MaintainerName', label: 'Maintainer', type: 'suggest', options: 'organizations' },
          {
            key: 'DataProviderName',
            label: 'Data provider',
            type: 'suggest',
            options: 'organizations',
          },
        ],
      },
      {
        title: 'Station site',
        description: 'Optional. A site groups stations that are close to each other.',
        fields: [
          { key: 'SiteName', label: 'Site name', type: 'suggest', options: 'sites' },
          {
            key: 'SiteLatitude',
            label: 'Site latitude',
            type: 'number',
            step: 'any',
            hint: 'Required for a new site',
          },
          {
            key: 'SiteLongitude',
            label: 'Site longitude',
            type: 'number',
            step: 'any',
            hint: 'Required for a new site',
          },
          { key: 'SiteElevationFt', label: 'Site elevation (feet, whole number)', type: 'number' },
          { key: 'SiteNotes', label: 'Site notes', type: 'textarea' },
        ],
      },
      {
        title: 'Sensor',
        description: 'How the station gets data for what it is monitoring.',
        fields: [
          {
            key: 'SensorName',
            label: 'Sensor name',
            type: 'suggest',
            options: 'sensors',
            required: true,
          },
          { key: 'SensorObservation', label: 'Sensor observation', type: 'text', required: true },
          { key: 'SensorNotes', label: 'Sensor notes', type: 'textarea' },
          {
            key: 'UnitName',
            label: 'Measurement unit',
            type: 'suggest',
            options: 'measurementUnits',
          },
          { key: 'UnitSymbol', label: 'Measurement unit symbol', type: 'text' },
        ],
      },
      {
        title: 'Device',
        description: 'Optional. What kind of technology the station uses.',
        fields: [
          {
            key: 'ManufacturerName',
            label: 'Manufacturer name',
            type: 'suggest',
            options: 'manufacturers',
            hint: 'Required if any device field is filled in',
          },
          { key: 'ManufacturerNotes', label: 'Manufacturer notes', type: 'textarea' },
          { key: 'ModelNumber', label: 'Device model number', type: 'text' },
          { key: 'ModelName', label: 'Device model name', type: 'text' },
          { key: 'ModelNotes', label: 'Device model notes', type: 'textarea' },
          { key: 'SerialNumber', label: 'Serial number', type: 'text' },
        ],
      },
    ],
  },

  organization: {
    name: 'organization',
    title: 'New organization',
    description: 'Add an organization and its main contact.',
    sections: [
      {
        title: 'Organization',
        fields: [
          { key: 'OrganizationName', label: 'Organization name', type: 'text', required: true },
          {
            key: 'OrganizationType',
            label: 'Organization type',
            type: 'select',
            options: 'organizationTypes',
            required: true,
          },
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
          {
            key: 'OrganizationID',
            label: 'Organization',
            type: 'select',
            options: 'organizations',
            required: true,
          },
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
          {
            key: 'ProjectID',
            label: 'Project',
            type: 'select',
            options: 'projects',
            required: true,
          },
          {
            key: 'StationTypeID',
            label: 'Station type',
            type: 'select',
            options: 'stationTypes',
            required: true,
          },
          {
            key: 'ObservationTypeID',
            label: 'Observation type',
            type: 'select',
            options: 'observationTypes',
            required: true,
          },
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
          {
            key: 'Longitude',
            label: 'Longitude',
            type: 'number',
            step: 'any',
            required: true,
            hint: 'For example -135.33',
          },
          {
            key: 'Latitude',
            label: 'Latitude',
            type: 'number',
            step: 'any',
            required: true,
            hint: 'For example 57.05',
          },
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
          {
            key: 'PrimaryOwnerID',
            label: 'Primary owner',
            type: 'select',
            options: 'organizations',
            required: true,
          },
          {
            key: 'SecondaryOwnerID',
            label: 'Secondary owner',
            type: 'select',
            options: 'organizations',
          },
          { key: 'MaintainerID', label: 'Maintainer', type: 'select', options: 'organizations' },
          {
            key: 'DataProviderID',
            label: 'Data provider',
            type: 'select',
            options: 'organizations',
          },
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
          {
            key: 'ManufacturerName',
            label: 'Manufacturer',
            type: 'suggest',
            options: 'manufacturers',
            required: true,
            hint: 'Pick one from the list, or type a new name',
          },
          {
            key: 'ManufacturerNotes',
            label: 'Manufacturer notes',
            type: 'textarea',
            hint: 'Only saved for a new manufacturer',
          },
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
          {
            key: 'StationTypeID',
            label: 'Station type',
            type: 'select',
            options: 'stationTypes',
            required: true,
          },
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
    description:
      'Enter the new contact person. They replace the current contact for this station. ' +
      'If someone with this email is already saved, they are reused.',
    sections: [
      {
        title: 'New contact',
        fields: [
          { key: 'ContactEmail', label: 'Email', type: 'email', required: true },
          { key: 'ContactFirstName', label: 'First name', type: 'text', required: true },
          { key: 'ContactLastName', label: 'Last name', type: 'text', required: true },
          {
            key: 'ContactNotes',
            label: 'Notes',
            type: 'textarea',
            hint: 'Only saved for a new person',
          },
        ],
      },
    ],
  },

  contact: {
    name: 'contact',
    title: 'Contact details',
    description: "Update this person's name, email or notes.",
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
          {
            key: 'PlacementHeightMeters',
            label: 'Placement height (meters)',
            type: 'number',
            step: 'any',
          },
          { key: 'PlacementNotes', label: 'Placement notes', type: 'textarea' },
          { key: 'Remove', label: 'Remove this sensor from the station', type: 'checkbox' },
        ],
      },
    ],
  },
} satisfies Record<string, FormDef>;

export type EditName = keyof typeof EDIT_DEFS;
