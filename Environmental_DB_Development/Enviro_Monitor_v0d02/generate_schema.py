"""
Testing file - dummy records insertion, schema generation
"""

from environmental_sensors_v0d02 import EnvironmentalSensorsDB
db_path = 'Enviro_Monitor_v0d02/EnvironmentalSensors.db'
import sqliteschema

db = EnvironmentalSensorsDB(db_path)

# Drop all tables if exists
db.drop_all_tables()

# Create all tables
db.create_Stations_table()
db.create_StationTypes_table()

db.create_SensorTypes_table()
db.create_StationSensors_table()

db.create_Organizations_table()
db.create_StationOrganizations_table()

db.create_Contacts_table()
db.create_StationContacts_table()

db.create_Tags_table()
db.create_StationTags_table()

db.create_QualityTypes_table()
db.create_StationSensorQuality_table()

# pull out schema
extractor = sqliteschema.SQLiteSchemaExtractor('Enviro_Monitor_v0d02/EnvironmentalSensors.db')
for verbosity_level in range(2):
    print("--- dump all of the table schemas with a tabular format: verbosity_level={} ---".format(
        verbosity_level))
    print(extractor.dumps(output_format="markdown", verbosity_level=verbosity_level))