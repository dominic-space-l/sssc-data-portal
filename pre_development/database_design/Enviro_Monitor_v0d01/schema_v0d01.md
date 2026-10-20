Connected to EnvironmentalSensors.db

Dropped all tables.

--- dump all of the table schemas with a tabular format: verbosity_level=0 ---
# Projects
|    Field    |  Type   |
| ----------- | ------- |
| ProjectID   | INTEGER |
| ProjectName | TEXT    |

# Maintainers
|     Field      |  Type   |
| -------------- | ------- |
| MaintainerID   | INTEGER |
| MaintainerName | TEXT    |

# Owner1
|   Field    |  Type   |
| ---------- | ------- |
| Owner1ID   | INTEGER |
| Owner1Name | TEXT    |

# Owner2
|   Field    |  Type   |
| ---------- | ------- |
| Owner2ID   | INTEGER |
| Owner2Name | TEXT    |

# DataProviders
|    Field     |  Type   |
| ------------ | ------- |
| ProviderID   | INTEGER |
| ProviderName | TEXT    |

# Contacts
|    Field     |  Type   |
| ------------ | ------- |
| ContactID    | INTEGER |
| ContactName  | TEXT    |
| ContactEmail | TEXT    |

# StationLocations
|    Field     |  Type   |
| ------------ | ------- |
| StationLocID | INTEGER |
| Latitude     | REAL    |
| Longitude    | REAL    |
| ElevationFT  | INTEGER |

# ReadingTypes
|       Field       |  Type   |
| ----------------- | ------- |
| ReadingTypesID    | INTEGER |
| Hydrologic        | BOOLEAN |
| Weather           | BOOLEAN |
| Coastal           | BOOLEAN |
| ExperimentalPlot  | BOOLEAN |
| Thermometer       | BOOLEAN |
| Seismometer       | BOOLEAN |
| Dewpoint          | BOOLEAN |
| Wind              | BOOLEAN |
| Visibility        | BOOLEAN |
| SkyConditions     | BOOLEAN |
| SeaLevelPressure  | BOOLEAN |
| WaveSwellHeight   | BOOLEAN |
| Altimeter         | BOOLEAN |
| SnowAmount        | BOOLEAN |
| Heated            | BOOLEAN |
| Seasonal          | BOOLEAN |
| ReliablePrecip    | BOOLEAN |
| ReliableForcsting | BOOLEAN |
| ReliableDewPoint  | BOOLEAN |
| ReliableWind      | BOOLEAN |
| ReliableTemp      | BOOLEAN |
| AdditnInfo        | TEXT    |

# Stations
|     Field      |  Type   |
| -------------- | ------- |
| StationID      | INTEGER |
| StationName    | TEXT    |
| StationCode    | BLOB    |
| RealTime       | BOOLEAN |
| Active         | BOOLEAN |
| WebLink        | TEXT    |
| MesowestLink   | TEXT    |
| TransmitTime   | BLOB    |
| StationLocID   | INTEGER |
| ReadingTypesID | INTEGER |
| Owner1ID       | INTEGER |
| Owner2ID       | INTEGER |
| MaintainerID   | INTEGER |
| ProjectID      | INTEGER |
| DataProviderID | INTEGER |
| ContactID      | INTEGER |

--- dump all of the table schemas with a tabular format: verbosity_level=1 ---
# Projects
|    Field    |  Type   | Nullable | Key | Default | Index |     Extra     |
| ----------- | ------- | -------- | --- | ------- | :---: | ------------- |
| ProjectID   | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| ProjectName | TEXT    | NO       |     |         |       |               |

# Maintainers
|     Field      |  Type   | Nullable | Key | Default | Index |     Extra     |
| -------------- | ------- | -------- | --- | ------- | :---: | ------------- |
| MaintainerID   | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| MaintainerName | TEXT    | NO       |     |         |       |               |

# Owner1
|   Field    |  Type   | Nullable | Key | Default | Index |     Extra     |
| ---------- | ------- | -------- | --- | ------- | :---: | ------------- |
| Owner1ID   | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| Owner1Name | TEXT    | NO       |     |         |       |               |

# Owner2
|   Field    |  Type   | Nullable | Key | Default | Index |     Extra     |
| ---------- | ------- | -------- | --- | ------- | :---: | ------------- |
| Owner2ID   | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| Owner2Name | TEXT    | NO       |     |         |       |               |

# DataProviders
|    Field     |  Type   | Nullable | Key | Default | Index |     Extra     |
| ------------ | ------- | -------- | --- | ------- | :---: | ------------- |
| ProviderID   | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| ProviderName | TEXT    | NO       |     |         |       |               |

# Contacts
|    Field     |  Type   | Nullable | Key | Default | Index |     Extra     |
| ------------ | ------- | -------- | --- | ------- | :---: | ------------- |
| ContactID    | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| ContactName  | TEXT    | NO       |     |         |       |               |
| ContactEmail | TEXT    | NO       |     |         |       |               |

# StationLocations
|    Field     |  Type   | Nullable | Key | Default | Index |     Extra     |
| ------------ | ------- | -------- | --- | ------- | :---: | ------------- |
| StationLocID | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| Latitude     | REAL    | NO       |     |         |       |               |
| Longitude    | REAL    | NO       |     |         |       |               |
| ElevationFT  | INTEGER | YES      |     | NULL    |       |               |

# ReadingTypes
|       Field       |  Type   | Nullable | Key | Default | Index |     Extra     |
| ----------------- | ------- | -------- | --- | ------- | :---: | ------------- |
| ReadingTypesID    | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| Hydrologic        | BOOLEAN | YES      |     | NULL    |       |               |
| Weather           | BOOLEAN | YES      |     | NULL    |       |               |
| Coastal           | BOOLEAN | YES      |     | NULL    |       |               |
| ExperimentalPlot  | BOOLEAN | YES      |     | NULL    |       |               |
| Thermometer       | BOOLEAN | YES      |     | NULL    |       |               |
| Seismometer       | BOOLEAN | YES      |     | NULL    |       |               |
| Dewpoint          | BOOLEAN | YES      |     | NULL    |       |               |
| Wind              | BOOLEAN | YES      |     | NULL    |       |               |
| Visibility        | BOOLEAN | YES      |     | NULL    |       |               |
| SkyConditions     | BOOLEAN | YES      |     | NULL    |       |               |
| SeaLevelPressure  | BOOLEAN | YES      |     | NULL    |       |               |
| WaveSwellHeight   | BOOLEAN | YES      |     | NULL    |       |               |
| Altimeter         | BOOLEAN | YES      |     | NULL    |       |               |
| SnowAmount        | BOOLEAN | YES      |     | NULL    |       |               |
| Heated            | BOOLEAN | YES      |     | NULL    |       |               |
| Seasonal          | BOOLEAN | YES      |     | NULL    |       |               |
| ReliablePrecip    | BOOLEAN | YES      |     | NULL    |       |               |
| ReliableForcsting | BOOLEAN | YES      |     | NULL    |       |               |
| ReliableDewPoint  | BOOLEAN | YES      |     | NULL    |       |               |
| ReliableWind      | BOOLEAN | YES      |     | NULL    |       |               |
| ReliableTemp      | BOOLEAN | YES      |     | NULL    |       |               |
| AdditnInfo        | TEXT    | YES      |     | NULL    |       |               |

# Stations
|     Field      |  Type   | Nullable | Key | Default | Index |     Extra     |
| -------------- | ------- | -------- | --- | ------- | :---: | ------------- |
| StationID      | INTEGER | YES      | PRI | NULL    |   X   | AUTOINCREMENT |
| StationName    | TEXT    | NO       |     |         |       |               |
| StationCode    | BLOB    | NO       |     |         |       |               |
| RealTime       | BOOLEAN | YES      |     | NULL    |       |               |
| Active         | BOOLEAN | YES      |     | NULL    |       |               |
| WebLink        | TEXT    | YES      |     | NULL    |       |               |
| MesowestLink   | TEXT    | YES      |     | NULL    |       |               |
| TransmitTime   | BLOB    | YES      |     | NULL    |       |               |
| StationLocID   | INTEGER | NO       |     |         |       |               |
| ReadingTypesID | INTEGER | NO       |     |         |       |               |
| Owner1ID       | INTEGER | NO       |     |         |       |               |
| Owner2ID       | INTEGER | YES      |     | NULL    |       |               |
| MaintainerID   | INTEGER | YES      |     | NULL    |       |               |
| ProjectID      | INTEGER | YES      |     | NULL    |       |               |
| DataProviderID | INTEGER | YES      |     | NULL    |       |               |
| ContactID      | INTEGER | YES      |     | NULL    |       |               |

Projects table records: 

(1, 'Precipitation Monitoring')
(2, 'Alaska Road Weather Information System')

Maintainers table records: 

(1, 'Sitka Sound Science Center')
(2, 'Haines Avalanche Center')

Owner1 table records: 

(1, 'Sitka Sound Science Center')
(2, 'Hoonah Indian Association')
(3, 'Alaska Avalanche Information Center')
(4, 'Alaska Department of Transportation')

Owner2 table records: 

(1, 'Sitka Sound Science Center')

DataProviders table records: 

(1, 'Sitka Sound Science Center')
(2, 'Haines Avalanche Center')
(3, 'National Weather Service')

Contacts table records: 

(1, 'Nicolas Mathews', 'nmathews@sitkascience.org')
(2, 'Luka Silva', 'lsilva@sitkascience.org')
(3, 'Erik Stevens', 'estevens@alaskasnow.org')

Contacts table records: 

(1, 'Nicolas Mathews', 'nmathews@sitkascience.org')
(2, 'Luka Silva', 'lsilva@sitkascience.org')
(3, 'Erik Stevens', 'estevens@alaskasnow.org')

ReadingTypes table records: 

(1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '\n    1 tipping bucket rain gauge, atmospheric pressure, temperature, and humidity, 2 soil moisture sensors, \n    1 piezometer (pres)
(2, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '\n    1 tipping bucket rain gauge, atmospheric pressure, temperature, and humidity, 2 soil moisture sensors, \n    1 piezometer (pres)
(3, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '\n    Rainfall, pore pressure, temperature, barometric pressure, relative humidity, soil moisture\n    ')
(4, 1, 1, 0, 0, 1, 0, None, None, None, None, None, None, None, 1, None, None, None, None, None, None, None, '\n    Rainfall, precipitation (rain and snowfall in antifreeze bucket), snow depth, wind sp)
(5, 1, 1, 0, 0, 1, 0, 1, 1, 1, None, None, None, None, None, 1, None, 1, 1, 1, 1, 1, None)

Stations table records: 

(1, 'Verstovia', 'Verstovia', 1, 1, None, None, None, 1, 1, 1, None, 1, 1, 1, 1)
(2, 'Harbor', 'Harbor', 1, 1, None, None, None, 2, 1, 1, None, 1, 1, 1, 1)
(3, 'Hoonah Mountain', 'Hoonah 1', 1, 1, None, None, None, 3, 2, 2, 1, 1, 1, 1, 2)
(4, 'Gavan', 'Gavan Hill', 1, 0, None, None, None, 4, 1, 1, None, 1, 1, 1, 1)
(5, 'Hoonah Indian Association', 'Hoonah 2', 1, 0, None, None, None, 5, 3, 2, 1, 1, 1, 1, 2)
(6, 'Lutak Hillside', 'TBD', None, 0, None, None, None, 6, 4, 3, None, 2, 2, 2, 3)
(7, 'Hollis Hwy Road Weather Information System', 'HOHA2', 1, 1, 'https://www.weather.gov/wrh/timeseries?site=HOHA2&hours=72', None, None, 7, 5, 4, None, None, None, 3, None)

