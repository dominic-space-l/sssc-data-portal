"""
Database class - SQLite creation, table manipulation
"""

import sqlite3

class EnvironmentalSensorsDB:
    """
    
    """
    def __init__(self, database_name='EnvironmentalSensors'):
        """
        Connect to the database
        If the database doesn't exist, the database is created
        Autocommit is set to False

        Args:
            database_name: Name of the database to be created/accessed
        """

        self.connection = sqlite3.connect(database_name, autocommit=False)
        self.cursor = None

    def drop_table(self, table_name, do_commit=True):
        """
        Drops the given table from the database

        Args:
            table_name: Name of table to be dropped
            do_commit: Whether the query should be committed
        """

        self.connection.execute(f'DROP TABLE IF EXISTS {table_name}')
        if do_commit:
            self.connection.commit()

    def create_Stations_table(self, do_commit=True):
        """
        Creates Stations table
        Has foreign keys to all other tables
        
        Args:
            do_commit: Whether the query should be committed
        """

        command = """
            CREATE TABLE IF NOT EXISTS Stations
            (
                StationID       INTEGER PRIMARY KEY AUTOINCREMENT,
                StationName     TEXT    NOT NULL,
                StationCode     BLOB    NOT NULL,
                RealTime        BOOLEAN,
                Active          BOOLEAN,
                WebLink         TEXT,
                MesowestLink    TEXT,
                TransmitTime    BLOB,

                StationLocID    INTEGER NOT NULL,
                ReadingTypesID  INTEGER NOT NULL, 
                Owner1ID        INTEGER NOT NULL,
                Owner2ID        INTEGER,
                MaintainerID    INTEGER,
                ProjectID       INTEGER,
                DataProviderID  INTEGER,
                ContactID       INTEGER,

                FOREIGN KEY(StationLocID)   REFERENCES StationLocations(StationLocID),
                FOREIGN KEY(ReadingTypesID) REFERENCES ReadingTypes(ReadingTypesID),
                FOREIGN KEY(Owner1ID)       REFERENCES Owner1(Owner1ID),
                FOREIGN KEY(Owner2ID)       REFERENCES Owner2(Owner2ID),
                FOREIGN KEY(MaintainerID)   REFERENCES Maintainer(MaintainerID),
                FOREIGN KEY(ProjectID)      REFERENCES Projects(ProjectID),
                FOREIGN KEY(DataProviderID) REFERENCES DataProviders(DataProviderID),
                FOREIGN KEY(ContactID)      REFERENCES Contacts(ContactID),
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()
    
    def create_ReadingTypes_table(self, do_commit=True):
        """
        Creates ReadingTypes table
        
        Args:
            do_commit: Whether the query should be committed
        """
        command = """
            CREATE TABLE IF NOT EXISTS ReadingTypes
            (
                ReadingTypesID INTEGER PRIMARY KEY AUTOINCREMENT,
                Hydrologic BOOLEAN,
                Weather BOOLEAN,
                Coastal BOOLEAN,
                ExperimentalPlot BOOLEAN,
                Thermometer BOOLEAN,
                Seismometer BOOLEAN,
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()