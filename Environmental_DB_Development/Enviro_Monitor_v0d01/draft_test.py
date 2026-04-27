"""
Testing file - dummy records insertion, schema generation
"""

from environmental_sensors_v0d01 import EnvironmentalSensorsDB

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

# Test Sensors (SSSC)
# Verstovia
# Harbor
# Hoonah Mountain
# Gavan
# Hoonah Indian Association
# (Other)
# Hollis Hwy Road Weather Information System
# Lutak Hillside

# Projects
db.insert_record_Projects_table('Precipitation Monitoring')
db.insert_record_Projects_table('Alaska Road Weather Information System')

records = db.select_records_Projects()
print('Projects table records: \n')
for r in records:
    print(r)

# Maintainers
db.insert_record_Maintainers_table('Sitka Sound Science Center')
db.insert_record_Maintainers_table('Haines Avalanche Center')

records = db.select_records_Maintainers()
print('Maintainers table records: \n')
for r in records:
    print(r)

# Owners
db.insert_record_Owner1_table('Sitka Sound Science Center')
db.insert_record_Owner1_table('Hoonah Indian Association')
db.insert_record_Owner1_table('Alaska Avalanche Information Center')
db.insert_record_Owner1_table('Alaska Department of Transportation')

records = db.select_records_Owner1()
print('Owner1 table records: \n')
for r in records:
    print(r)

db.insert_record_Owner2_table('Sitka Sound Science Center')

records = db.select_records_Owner2()
print('Owner2 table records: \n')
for r in records:
    print(r)

# Data Providers
db.insert_record_DataProviders_table('Sitka Sound Science Center')
db.insert_record_DataProviders_table('Haines Avalanche Center')
db.insert_record_DataProviders_table('National Weather Service')

records = db.select_records_DataProviders()
print('DataProviders table records: \n')
for r in records:
    print(r)

# Contacts

db.insert_record_Contacts_table('Nicolas Mathews', 'nmathews@sitkascience.org')
db.insert_record_Contacts_table('Luka Silva', 'lsilva@sitkascience.org')
db.insert_record_Contacts_table('Erik Stevens', 'estevens@alaskasnow.org')

records = db.select_records_Contacts()
print('Contacts table records: \n')
for r in records:
    print(r)

# StationLocations
db.insert_record_StationLocations_table(57.05464, -135.2964, 732)
db.insert_record_StationLocations_table(57.0886, -135.36392, 2106)
db.insert_record_StationLocations_table(58.122174, -135.416728)
db.insert_record_StationLocations_table(57.07337, -135.35402, 728)
db.insert_record_StationLocations_table(58.1097898, -135.4441198)
db.insert_record_StationLocations_table(59.30179, -135.551438)
db.insert_record_StationLocations_table(55.458, -132.8412, 316)

records = db.select_records_Contacts()
print('Contacts table records: \n')
for r in records:
    print(r)

# ReadingTypes
db.insert_record_ReadingTypes_table(
    Hydrologic=True, Coastal=True, ExperimentalPlot=False, Seismometer=False, Thermometer=True,
    Dewpoint=True, Wind=False, Visibility=False, SkyConditions=False,
)