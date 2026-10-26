## Table `StationRoles`

Contains the possible role relationships that an Organization can have towards a Station. Contacts are tied to a specific Role when they are linked to a Station.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `RoleID` | `int8` | Primary Identity |
| `RoleTitle` | `text` |  Unique |
| `RoleNotes` | `text` |  Nullable |

## Table `Organizations`

Organizations that are associated with Stations. An Organization is tied to a Role when linked to a Station.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `OrganizationID` | `int8` | Primary Identity |
| `OrganizationName` | `text` |  Unique |
| `OrganizationType` | `ORGANIZATION_TYPE` |  Nullable |
| `OrganizationNotes` | `text` |  Nullable |

## Table `DeviceManufacturers`

Manufacturers of Sensors and/or Stations models.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ManufacturerID` | `int8` | Primary Identity |
| `ManufacturerName` | `text` |  Unique |
| `ManufacturerNotes` | `text` |  Nullable |

## Table `MeasurementUnits`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `MeasurementUnitsID` | `int8` | Primary Identity |
| `UnitName` | `text` |  Nullable Unique |
| `UnitSymbol` | `text` |  Nullable Unique |

## Table `StationTypes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `TypeID` | `int8` | Primary Identity |
| `TypeName` | `text` |  Unique |
| `TypeNotes` | `text` |  Nullable |

## Table `StationSites`

Geographic locations where Stations are placed. May contain more than one Station.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SiteID` | `int8` | Primary Identity |
| `SiteName` | `text` |  Nullable |
| `CoordinateLocation` | `geography` |  Unique |
| `Longitude` | `numeric` |  |
| `Latitude` | `numeric` |  |
| `Elevation` | `int8` |  Nullable |
| `SiteNotes` | `text` |  Nullable |

## Table `OrganizationProjects`

Projects that are headed by an organization. Each project may be associated with one or more Stations.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ProjectID` | `int8` | Primary Identity |
| `OrganizationID` | `int8` |  |
| `ProjectName` | `text` |  Unique |
| `StartDate` | `date` |  Nullable |
| `EndDate` | `date` |  Nullable |
| `IsOngoing` | `bool` |  Nullable |
| `ProjectNotes` | `text` |  Nullable |

## Table `Contacts`

Contacts are associated with an Organization where they are employed and tied to a Role when related to a Station.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ContactID` | `int8` | Primary Identity |
| `OrganizationID` | `int8` |  |
| `Email` | `text` |  |
| `FirstName` | `text` |  Nullable |
| `LastName` | `text` |  Nullable |
| `ContactNotes` | `text` |  Nullable |

## Table `DeviceSpecifications`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `DeviceSpecificationID` | `int8` | Primary Identity |
| `ManufacturerID` | `int8` |  |
| `ModelNumber` | `text` |  Nullable |
| `ModelName` | `text` |  Nullable |
| `ModelNotes` | `text` |  Nullable |

## Table `Stations`

The "primary" table of this schema. Holds core information regarded the environmental sensors. Links to almost every corner of the schema for station specs, organization relationships, contacts, and more.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `StationID` | `int8` | Primary Identity |
| `ProjectID` | `int8` |  Nullable |
| `SiteID` | `int8` |  Nullable |
| `StationTypeID` | `int8` |  Nullable |
| `StationName` | `text` |  |
| `StationCode` | `text` |  Nullable |
| `InstallDate` | `date` |  Nullable |
| `WebLink` | `text` |  Nullable |
| `MesoWestLink` | `text` |  Nullable |
| `IsActive` | `bool` |  Nullable |
| `IsRealTime` | `bool` |  Nullable |
| `IsSeasonal` | `bool` |  Nullable |
| `UpdateInterval` | `text` |  Nullable |
| `TransmitTime` | `text` |  Nullable |
| `CoordinateLocation` | `geometry` |  Nullable |
| `Longitude` | `numeric` |  |
| `Latitude` | `numeric` |  |
| `Elevation (FT)` | `int8` |  Nullable |
| `StationNotes` | `text` |  Nullable |

## Table `Sensors`

Table to house the information regarding specific Sensors. Placement on the station and relationships with specifications, units, and obersvation types.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SensorID` | `int8` | Primary Identity |
| `SensorName` | `text` |  Unique |
| `SensorNotes` | `text` |  Nullable |
| `SensorObservation` | `text` |  Nullable |
| `ObservationTypeID` | `int8` |  Nullable |

## Table `StationContact`

Linking table that assigns each station a Contact person. This relationship is tied to a specific role regarding the station. Most often will be maintainer.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `StationID` | `int8` | Primary Identity |
| `ContactID` | `int8` |  |
| `RoleID` | `int8` |  Nullable |

## Table `StationOrganizationRole`

Linking table relating Organizations to their Roles for Stations.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `OrganizationID` | `int8` | Primary |
| `StationID` | `int8` | Primary Identity |
| `RoleID` | `int8` | Primary |

## Table `StationsToSpecs`

Linking table relating Stations to their DeviceSpecifications.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `StationID` | `int8` | Primary Identity |
| `DeviceSpecificationID` | `int8` | Primary |
| `SerialNumber` | `text` |  Nullable |

## Table `SensorsToSpecs`

Linking table relating Sensors to their DeviceSpecifications.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `SensorID` | `int8` | Primary Identity |
| `DeviceSpecificationID` | `int8` | Primary |
| `SerialNumber` | `text` |  Nullable |

## Table `StationsToSensors`

Linking table between Stations and Sensors. Contains placement information, measurement units, and type of observation.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `StationID` | `int8` | Primary Identity |
| `SensorID` | `int8` | Primary Identity |
| `PlacementHeight (Meters)` | `float4` |  Nullable |
| `PlacementNotes` | `text` |  Nullable |
| `Count` | `int2` |  Nullable |
| `MeasurementUnitsID` | `int8` |  Nullable |

## Table `ObservationTypes`

Types of environmental observations that are present. Associated with different sensors, but also with Stations as a whole. This means that even if detailed sensor information is not provided, stations can still be associated with certain observations.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `ObservationTypeID` | `int8` | Primary Identity |
| `ObservationType` | `text` |  Nullable Unique |

## Table `StationObservations`

Linking table relating Stations to ObservationTypes. Some redundancy with StationSensors, to account for Stations with minimal sensor information provided.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `StationID` | `int8` | Primary Identity |
| `ObservationTypeID` | `int8` | Primary |
| `Quality` | `OBSERVATION_QUALITY_FLAG` |  Nullable |

## Custom Types / Enums

### `ORGANIZATION_TYPE`

`non-profit` | `private-company` | `educational-institution` | `tribal-government` | `federal-government` | `state-government` | `international-government` | `military`

### `OBSERVATION_QUALITY_FLAG`

`unknown` | `reliable` | `questionable` | `unreliable`

