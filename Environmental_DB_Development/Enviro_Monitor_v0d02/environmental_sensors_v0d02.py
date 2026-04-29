"""
Database class - SQLite creation, table manipulation
"""

import sqlite3

class EnvironmentalSensorsDB:
    """
    
    """
    def __init__(self, database_name='Enviro_Monitor_v0d02/EnvironmentalSensors.db'): #
        """
        Connect to the database
        If the database doesn't exist, the database is created
        Autocommit is set to False
        """

        self.connection = sqlite3.connect(database_name, autocommit=False)
        print(f"Connected to {database_name}\n")
        self.cursor = self.connection.cursor()

        self.table_list = [
            'Projects', 'Maintainers', 'Owners', 
            'DataProviders', 'Contacts', 'StationLocations', 
            'ReadingTypes', 'Stations'
                      ]

    def drop_table(self, table_name, do_commit=True):
        """
        Drops the given table from the database
        """

        self.connection.execute(f'DROP TABLE IF EXISTS {table_name}')
        if do_commit:
            self.connection.commit()
            print(f"Dropped {table_name} table.\n")

    def drop_all_tables(self):
        """
        Drops all tables then commits
        """
        for table in self.table_list:
            self.drop_table(table, do_commit=False)
        self.connection.commit()
        print(f"Dropped all tables.\n")

    # ========================
    # Table Creation Functions
    # ========================

    def create_Stations_table(self, do_commit=True):
        """
        Creates Stations table
        """

        command = """
            CREATE TABLE Stations(
            StationPK INTEGER PRIMARY KEY,

            StationName TEXT NOT NULL,
            StationID TEXT,

            Latitude REAL NOT NULL,
            Longitude REAL NOT NULL,
            ElevationFT INTEGER,

            IsActive BOOLEAN,
            IsRealTime BOOLEAN,

            TransmitTime TEXT,
            WebLink TEXT,
            MesowestLink TEXT,

            Heated BOOLEAN,
            Seasonal BOOLEAN,

            AdditionalInformation TEXT,
            DeviceDetails TEXT
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()
    


    # =====================
    # Table Input Functions
    # =====================

    def insert_record_Stations_table(
            self,

            do_commit=True
            ):
        """
        Inserts a record into the Stations table
        """
        command = """
            INSERT INTO Stations
                ()
            Values ()
            """
        
        self.cursor.execute(command, (

        ))
        if do_commit:
            self.connection.commit()


    # ====================
    # Select Table Records
    # ====================

    def select_records_Stations(self):
        self.cursor.execute('SELECT * FROM Stations')
        records = self.cursor.fetchall()
        return records