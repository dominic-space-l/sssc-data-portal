"""
Testing file - dummy records insertion, schema generation
"""

from environmental_sensors_v0d01 import EnvironmentalSensorsDB
import sqliteschema

db = EnvironmentalSensorsDB()

# Drop all tables if exists
db.drop_all_tables()

# Create all tables
db.create_Projects_table()
db.create_Maintainers_table()
db.create_Owner1_table()
db.create_Owner2_table()
db.create_DataProviders_table()
db.create_Contacts_table()
db.create_StationLocations_table()
db.create_ReadingTypes_table()
db.create_Stations_table()

# pull out schema
extractor = sqliteschema.SQLiteSchemaExtractor('EnvironmentalSensors.db')
for verbosity_level in range(2):
    print("--- dump all of the table schemas with a tabular format: verbosity_level={} ---".format(
        verbosity_level))
    print(extractor.dumps(output_format="markdown", verbosity_level=verbosity_level))

# Test Sensors (SSSC)
# Verstovia
# Harbor
# Hoonah Mountain
# Gavan
# Hoonah Indian Association
# (Other)
# Lutak Hillside
# Hollis Hwy Road Weather Information System


# Projects
db.insert_record_Projects_table('Precipitation Monitoring') # all SSSC
db.insert_record_Projects_table('Alaska Road Weather Information System') # lutak

records = db.select_records_Projects()
print('Projects table records: \n')
for r in records:
    print(r)

# Maintainers
db.insert_record_Maintainers_table('Sitka Sound Science Center') # all SSSC
db.insert_record_Maintainers_table('Haines Avalanche Center') # lutak

records = db.select_records_Maintainers()
print('Maintainers table records: \n')
for r in records:
    print(r)

# Owners
db.insert_record_Owner1_table('Sitka Sound Science Center') # verstovia, harbor, gavan
db.insert_record_Owner1_table('Hoonah Indian Association') # hoonah mt and association
db.insert_record_Owner1_table('Alaska Avalanche Information Center') # lutak
db.insert_record_Owner1_table('Alaska Department of Transportation') # hollis

records = db.select_records_Owner1()
print('Owner1 table records: \n')
for r in records:
    print(r)

db.insert_record_Owner2_table('Sitka Sound Science Center') # hoonah mt and association

records = db.select_records_Owner2()
print('Owner2 table records: \n')
for r in records:
    print(r)

# Data Providers
db.insert_record_DataProviders_table('Sitka Sound Science Center') # all SSSC
db.insert_record_DataProviders_table('Haines Avalanche Center') # lutak
db.insert_record_DataProviders_table('National Weather Service') # hollis

records = db.select_records_DataProviders()
print('DataProviders table records: \n')
for r in records:
    print(r)

# Contacts

db.insert_record_Contacts_table('Nicolas Mathews', 'nmathews@sitkascience.org') # verstovia, harbor, gavan
db.insert_record_Contacts_table('Luka Silva', 'lsilva@sitkascience.org') # hoonah mt and association
db.insert_record_Contacts_table('Erik Stevens', 'estevens@alaskasnow.org') # lutak

records = db.select_records_Contacts()
print('Contacts table records: \n')
for r in records:
    print(r)

# StationLocations
db.insert_record_StationLocations_table(57.05464, -135.2964, 732) # verstovia
db.insert_record_StationLocations_table(57.0886, -135.36392, 2106) # harbor
db.insert_record_StationLocations_table(58.122174, -135.416728) # hoonah mt
db.insert_record_StationLocations_table(57.07337, -135.35402, 728) # gavan
db.insert_record_StationLocations_table(58.1097898, -135.4441198) # hoonah association
db.insert_record_StationLocations_table(59.30179, -135.551438) # lutak hillside
db.insert_record_StationLocations_table(55.458, -132.8412, 316) # hollis hwy road

records = db.select_records_Contacts()
print('Contacts table records: \n')
for r in records:
    print(r)

# ReadingTypes
db.insert_record_ReadingTypes_table( # verstovia, harbor, gavan
    Hydrologic=True, Weather=True, Coastal=True, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=True, Wind=False, Visibility=False, SkyConditions=False, SeaLevelPressure=False,
    WaveSwellHeight=False, Altimeter=False, SnowAmount=False, Heated=False, Seasonal=False, 
    ReliablePrecip=False, ReliableForcsting=False, ReliableDewPoint=False, ReliableTemp=False, ReliableWind=False, 
    AdditnInfo="""
    1 tipping bucket rain gauge, atmospheric pressure, temperature, and humidity, 2 soil moisture sensors, 
    1 piezometer (pressure sensor) at the bottom of a ~1 m well
    """
)
db.insert_record_ReadingTypes_table( # hoonah mt
    Hydrologic=True, Weather=True, Coastal=True, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=True, Wind=False, Visibility=False, SkyConditions=False, SeaLevelPressure=False,
    WaveSwellHeight=False, Altimeter=False, SnowAmount=False, Heated=False, Seasonal=False, 
    ReliablePrecip=False, ReliableForcsting=False, ReliableDewPoint=False, ReliableTemp=False, ReliableWind=False, 
    AdditnInfo="""
    1 tipping bucket rain gauge, atmospheric pressure, temperature, and humidity, 2 soil moisture sensors, 
    1 piezometer (pressure sensor) at the bottom of a ~1 m well
    The station equipment is manufactured by Onset Computer Corporation. Employees of the Sitka Sound Science Center, 
    Tlingit & Haida, and the University of Oregon installed a hydrologic monitoring station in Hoonah on July 29, 2023.
    """
)
db.insert_record_ReadingTypes_table( # hoonah association
    Hydrologic=True, Weather=True, Coastal=True, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=True, Wind=False, Visibility=False, SkyConditions=False, SeaLevelPressure=False,
    WaveSwellHeight=False, Altimeter=False, SnowAmount=False, Heated=False, Seasonal=False, 
    ReliablePrecip=False, ReliableForcsting=False, ReliableDewPoint=False, ReliableTemp=False, ReliableWind=False, 
    AdditnInfo="""
    Rainfall, pore pressure, temperature, barometric pressure, relative humidity, soil moisture
    """
)
db.insert_record_ReadingTypes_table( # lutak
    Hydrologic=True, Weather=True, Coastal=False, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=None, Wind=None, Visibility=None, SkyConditions=None, SeaLevelPressure=None,
    WaveSwellHeight=None, Altimeter=None, SnowAmount=True, Heated=None, Seasonal=None, 
    ReliablePrecip=None, ReliableForcsting=None, ReliableDewPoint=None, ReliableTemp=None,
    ReliableWind=None,
    AdditnInfo="""
    Rainfall, precipitation (rain and snowfall in antifreeze bucket), snow depth, wind speed, air temp, 
    relative humidity, soil temperature, soil moisture, ground water pressure, camera
    """
)
db.insert_record_ReadingTypes_table( # hollis
    Hydrologic=True, Weather=True, Coastal=False, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=True, Wind=True, Visibility=True, SkyConditions=None, SeaLevelPressure=None,
    WaveSwellHeight=None, Altimeter=None, SnowAmount=None, Heated=True, Seasonal=None, 
    ReliablePrecip=True, ReliableForcsting=True, ReliableDewPoint=True, ReliableTemp=True, ReliableWind=True,
    AdditnInfo=None
)

records = db.select_records_ReadingTypes()
print('ReadingTypes table records: \n')
for r in records:
    print(r)

# Stations
db.insert_record_Stations_table( # verstovia
    StationName="Verstovia", StationCode="Verstovia", RealTime=True, Active=True,
    StationLocID=1, ReadingTypesID=1, Owner1ID=1, MaintainerID=1, ProjectID=1,
    DataProviderID=1, ContactID=1
    )
db.insert_record_Stations_table( # harbor
    StationName="Harbor", StationCode="Harbor", RealTime=True, Active=True,
     StationLocID=2, ReadingTypesID=1, Owner1ID=1, Owner2ID=None,
    MaintainerID=1, ProjectID=1, DataProviderID=1, ContactID=1
)
db.insert_record_Stations_table( # hoonah mt
    StationName="Hoonah Mountain", StationCode="Hoonah 1", RealTime=True, Active=True,
     StationLocID=3, ReadingTypesID=2, Owner1ID=2, Owner2ID=1,
    MaintainerID=1, ProjectID=1, DataProviderID=1, ContactID=2
)
db.insert_record_Stations_table( # gavan
    StationName="Gavan", StationCode="Gavan Hill", RealTime=True, Active=False,
     StationLocID=4, ReadingTypesID=1, Owner1ID=1, Owner2ID=None,
    MaintainerID=1, ProjectID=1, DataProviderID=1, ContactID=1
)
db.insert_record_Stations_table( # hoonah association
    StationName="Hoonah Indian Association", StationCode="Hoonah 2", RealTime=True, Active=False,
    StationLocID=5, ReadingTypesID=3, Owner1ID=2, Owner2ID=1,
    MaintainerID=1, ProjectID=1, DataProviderID=1, ContactID=2
)
db.insert_record_Stations_table( # lutak
    StationName="Lutak Hillside", StationCode="TBD", RealTime=None, Active=False,
    StationLocID=6, ReadingTypesID=4, Owner1ID=3, Owner2ID=None,
    MaintainerID=2, ProjectID=2, DataProviderID=2, ContactID=3
)
db.insert_record_Stations_table( # hollis
    StationName="Hollis Hwy Road Weather Information System", StationCode="HOHA2", RealTime=True, Active=True, WebLink="https://www.weather.gov/wrh/timeseries?site=HOHA2&hours=72",
    StationLocID=7, ReadingTypesID=5, Owner1ID=4, Owner2ID=None,
    MaintainerID=None, ProjectID=None, DataProviderID=3, ContactID=None
)

records = db.select_records_Stations()
print('Stations table records: \n')
for r in records:
    print(r)