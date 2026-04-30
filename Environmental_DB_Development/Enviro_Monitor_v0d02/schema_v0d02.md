Connected to Enviro_Monitor_v0d02/EnvironmentalSensors.db

Dropped all tables.

--- dump all of the table schemas with a tabular format: verbosity_level=0 ---
# Stations
|         Field         |     Type     |
| --------------------- | ------------ |
| StationID             | INTEGER      |
| StationName           | TEXT         |
| StationCode           | TEXT         |
| Latitude              | REAL         |
| Longitude             | REAL         |
| ElevationFT           | INTEGER      |
| IsActive              | BOOLEAN      |
| IsRealTime            | BOOLEAN      |
| TransmitTime          | TEXT         |
| WebLink               | TEXT         |
| MesowestLink          | TEXT         |
| Heated                | BOOLEAN      |
| Seasonal              | BOOLEAN      |
| AdditionalInformation | TEXT         |
| DeviceDetails         | TEXT         |
| StationTypeID         | INTEGER      |
| REFERENCES            | StationTypes |

# StationTypes
|     Field     |  Type   |
| ------------- | ------- |
| StationTypeID | INTEGER |
| Name          | TEXT    |

# SensorTypes
|    Field     |  Type   |
| ------------ | ------- |
| SensorTypeID | INTEGER |
| Name         | TEXT    |

# StationSensors
|     Field     |  Type   |
| ------------- | ------- |
| StationID     | INTEGER |
| SensorTypeID  | INTEGER |
| PRIMARY       | KEY     |
| SensorTypeID) |         |

# Organizations
|     Field      |  Type   |
| -------------- | ------- |
| OrganizationID | INTEGER |
| Name           | TEXT    |

# StationOrganizations
|     Field      |  Type   |
| -------------- | ------- |
| StationID      | INTEGER |
| OrganizationID | INTEGER |
| Role           | TEXT    |
| PRIMARY        | KEY     |
| OrganizationID |         |
| Role)          |         |

# Contacts
|   Field   |  Type   |
| --------- | ------- |
| ContactID | INTEGER |
| Name      | TEXT    |
| Email     | TEXT    |

# StationContacts
|   Field    |  Type   |
| ---------- | ------- |
| StationID  | INTEGER |
| ContactID  | INTEGER |
| PRIMARY    | KEY     |
| ContactID) |         |

# Tags
| Field |  Type   |
| ----- | ------- |
| TagID | INTEGER |
| Name  | TEXT    |

# StationTags
|   Field   |  Type   |
| --------- | ------- |
| StationID | INTEGER |
| TagID     | INTEGER |
| PRIMARY   | KEY     |
| TagID)    |         |

# QualityTypes
|     Field      |  Type   |
| -------------- | ------- |
| QualityTypesID | INTEGER |
| Name           | TEXT    |

# StationSensorQuality
|     Field      |  Type   |
| -------------- | ------- |
| StationID      | INTEGER |
| SensorTypeID   | INTEGER |
| QualityTypeID  | INTEGER |
| Value          | BOOLEAN |
| PRIMARY        | KEY     |
| SensorTypeID   |         |
| QualityTypeID) |         |

--- dump all of the table schemas with a tabular format: verbosity_level=1 ---
# Stations
|         Field         |     Type     | Nullable | Key | Default | Index | Extra |
| --------------------- | ------------ | -------- | --- | ------- | :---: | ----- |
| StationID             | INTEGER      | YES      | PRI | NULL    |   X   |       |
| StationName           | TEXT         | NO       |     |         |       |       |
| StationCode           | TEXT         | YES      |     | NULL    |       |       |
| Latitude              | REAL         | NO       |     |         |       |       |
| Longitude             | REAL         | NO       |     |         |       |       |
| ElevationFT           | INTEGER      | YES      |     | NULL    |       |       |
| IsActive              | BOOLEAN      | YES      |     | NULL    |       |       |
| IsRealTime            | BOOLEAN      | YES      |     | NULL    |       |       |
| TransmitTime          | TEXT         | YES      |     | NULL    |       |       |
| WebLink               | TEXT         | YES      |     | NULL    |       |       |
| MesowestLink          | TEXT         | YES      |     | NULL    |       |       |
| Heated                | BOOLEAN      | YES      |     | NULL    |       |       |
| Seasonal              | BOOLEAN      | YES      |     | NULL    |       |       |
| AdditionalInformation | TEXT         | YES      |     | NULL    |       |       |
| DeviceDetails         | TEXT         | YES      |     | NULL    |       |       |
| StationTypeID         | INTEGER      | YES      |     | NULL    |       |       |
| REFERENCES            | StationTypes | YES      |     | NULL    |       |       |

# StationTypes
|     Field     |  Type   | Nullable | Key | Default | Index | Extra |
| ------------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationTypeID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name          | TEXT    | YES      | UNI | NULL    |   X   |       |

# SensorTypes
|    Field     |  Type   | Nullable | Key | Default | Index | Extra |
| ------------ | ------- | -------- | --- | ------- | :---: | ----- |
| SensorTypeID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name         | TEXT    | YES      | UNI | NULL    |   X   |       |

# StationSensors
|     Field     |  Type   | Nullable | Key | Default | Index | Extra |
| ------------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationID     | INTEGER | YES      |     | NULL    |       |       |
| SensorTypeID  | INTEGER | YES      |     | NULL    |       |       |
| PRIMARY       | KEY     | YES      |     | NULL    |       |       |
| SensorTypeID) |         | YES      |     | NULL    |       |       |

# Organizations
|     Field      |  Type   | Nullable | Key | Default | Index | Extra |
| -------------- | ------- | -------- | --- | ------- | :---: | ----- |
| OrganizationID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name           | TEXT    | YES      | UNI | NULL    |   X   |       |

# StationOrganizations
|     Field      |  Type   | Nullable | Key | Default | Index | Extra |
| -------------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationID      | INTEGER | YES      |     | NULL    |       |       |
| OrganizationID | INTEGER | YES      |     | NULL    |       |       |
| Role           | TEXT    | YES      |     | NULL    |       |       |
| PRIMARY        | KEY     | YES      |     | NULL    |       |       |
| OrganizationID |         | YES      |     | NULL    |       |       |
| Role)          |         | YES      |     | NULL    |       |       |

# Contacts
|   Field   |  Type   | Nullable | Key | Default | Index | Extra |
| --------- | ------- | -------- | --- | ------- | :---: | ----- |
| ContactID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name      | TEXT    | YES      |     | NULL    |       |       |
| Email     | TEXT    | YES      | UNI | NULL    |   X   |       |

# StationContacts
|   Field    |  Type   | Nullable | Key | Default | Index | Extra |
| ---------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationID  | INTEGER | YES      |     | NULL    |       |       |
| ContactID  | INTEGER | YES      |     | NULL    |       |       |
| PRIMARY    | KEY     | YES      |     | NULL    |       |       |
| ContactID) |         | YES      |     | NULL    |       |       |

# Tags
| Field |  Type   | Nullable | Key | Default | Index | Extra |
| ----- | ------- | -------- | --- | ------- | :---: | ----- |
| TagID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name  | TEXT    | YES      | UNI | NULL    |   X   |       |

# StationTags
|   Field   |  Type   | Nullable | Key | Default | Index | Extra |
| --------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationID | INTEGER | YES      |     | NULL    |       |       |
| TagID     | INTEGER | YES      |     | NULL    |       |       |
| PRIMARY   | KEY     | YES      |     | NULL    |       |       |
| TagID)    |         | YES      |     | NULL    |       |       |

# QualityTypes
|     Field      |  Type   | Nullable | Key | Default | Index | Extra |
| -------------- | ------- | -------- | --- | ------- | :---: | ----- |
| QualityTypesID | INTEGER | YES      | PRI | NULL    |   X   |       |
| Name           | TEXT    | YES      | UNI | NULL    |   X   |       |

# StationSensorQuality
|     Field      |  Type   | Nullable | Key | Default | Index | Extra |
| -------------- | ------- | -------- | --- | ------- | :---: | ----- |
| StationID      | INTEGER | YES      |     | NULL    |       |       |
| SensorTypeID   | INTEGER | YES      |     | NULL    |       |       |
| QualityTypeID  | INTEGER | YES      |     | NULL    |       |       |
| Value          | BOOLEAN | YES      |     | NULL    |       |       |
| PRIMARY        | KEY     | YES      |     | NULL    |       |       |
| SensorTypeID   |         | YES      |     | NULL    |       |       |
| QualityTypeID) |         | YES      |     | NULL    |       |       |
