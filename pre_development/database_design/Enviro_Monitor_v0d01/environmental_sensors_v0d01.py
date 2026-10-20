"""
Database class - SQLite creation, table manipulation
"""

import sqlite3

class EnvironmentalSensorsDB:
    """
    
    """
    def __init__(self, database_name='Enviro_Monitor_v0d01/EnvironmentalSensors.db'): #
        """
        Connect to the database
        If the database doesn't exist, the database is created
        Autocommit is set to False
        """

        self.connection = sqlite3.connect(database_name, autocommit=False)
        print(f"Connected to {database_name}\n")
        self.cursor = self.connection.cursor()

        self.table_list = [
            'Projects', 'Maintainers', 'Owner1', 'Owner2', 
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
        Has foreign keys to all other tables
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
                FOREIGN KEY(ContactID)      REFERENCES Contacts(ContactID)
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()
    
    def create_ReadingTypes_table(self, do_commit=True):
        """
        Creates ReadingTypes table
        """
        command = """
            CREATE TABLE IF NOT EXISTS ReadingTypes
            (
                ReadingTypesID      INTEGER PRIMARY KEY AUTOINCREMENT,
                Hydrologic          BOOLEAN,
                Weather             BOOLEAN,
                Coastal             BOOLEAN,
                ExperimentalPlot    BOOLEAN,
                Thermometer         BOOLEAN,
                Seismometer         BOOLEAN,
                Dewpoint            BOOLEAN,
                Wind                BOOLEAN,
                Visibility          BOOLEAN,
                SkyConditions       BOOLEAN,
                SeaLevelPressure    BOOLEAN,
                WaveSwellHeight     BOOLEAN,
                Altimeter           BOOLEAN,
                SnowAmount          BOOLEAN,
                Heated              BOOLEAN,
                Seasonal            BOOLEAN,
                ReliablePrecip      BOOLEAN,
                ReliableForcsting   BOOLEAN,
                ReliableDewPoint    BOOLEAN,
                ReliableWind        BOOLEAN,
                ReliableTemp        BOOLEAN,
                AdditnInfo          TEXT
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationLocations_table(self, do_commit=True):
        """
        Creates StationLocations table
        """
        command = """
            CREATE TABLE IF NOT EXISTS StationLocations
            (
                StationLocID INTEGER PRIMARY KEY AUTOINCREMENT,
                Latitude     REAL   NOT NULL,
                Longitude    REAL   NOT NULL,
                ElevationFT  INTEGER

            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_Contacts_table(self, do_commit=True):
        """
        Creates Contacts table
        """
        command = """
            CREATE TABLE IF NOT EXISTS Contacts
            (
                ContactID       INTEGER PRIMARY KEY AUTOINCREMENT,
                ContactName     TEXT    NOT NULL,
                ContactEmail    TEXT    NOT NULL
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_DataProviders_table(self, do_commit=True):
        """
        Creates DataProviders table
        """
        command = """
            CREATE TABLE IF NOT EXISTS DataProviders
            (
                ProviderID      INTEGER PRIMARY KEY AUTOINCREMENT,
                ProviderName    TEXT    NOT NULL
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_Owner1_table(self, do_commit=True):
        """
        Creates Owner1 table
        """
        command = """
            CREATE TABLE IF NOT EXISTS Owner1
            (
                Owner1ID      INTEGER PRIMARY KEY AUTOINCREMENT,
                Owner1Name    TEXT    NOT NULL
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_Owner2_table(self, do_commit=True):
        """
        Creates Owner2 table
        """
        command = """
            CREATE TABLE IF NOT EXISTS Owner2
            (
                Owner2ID      INTEGER PRIMARY KEY AUTOINCREMENT,
                Owner2Name    TEXT    NOT NULL
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_Maintainers_table(self, do_commit=True):
        """
        Creates Maintainers table
        """
        command = """
            CREATE TABLE IF NOT EXISTS Maintainers
            (
                MaintainerID      INTEGER PRIMARY KEY AUTOINCREMENT,
                MaintainerName    TEXT    NOT NULL
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_Projects_table(self, do_commit=True):
        """
        Creates Projects table
        """
        command = """
            CREATE TABLE IF NOT EXISTS Projects
            (
                ProjectID      INTEGER PRIMARY KEY AUTOINCREMENT,
                ProjectName    TEXT    NOT NULL
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
            StationName:str,
            StationCode:str,
            StationLocID:int,
            ReadingTypesID:int,
            Owner1ID:int,
            RealTime:bool|None=None,
            Active:bool|None=None,
            WebLink:str|None=None,
            MesowestLink:str|None=None,
            TransmitTime:str|None=None,
            Owner2ID:int|None=None,
            MaintainerID:int|None=None,
            ProjectID:int|None=None,
            DataProviderID:int|None=None,
            ContactID:int|None=None,
            do_commit=True
            ):
        """
        Inserts a record into the Stations table
        """
        command = """
            INSERT INTO Stations
                (StationName, StationCode, StationLocID, ReadingTypesID, Owner1ID,
                RealTime, Active, WebLink, MesowestLink, TransmitTime,
                Owner2ID, MaintainerID, ProjectID, DataProviderID, ContactID)
            Values (?, ?, ?, ?, ?,   ?, ?, ?, ?, ?,   ?, ?, ?, ?, ?)
            """
        
        self.cursor.execute(command, (
            StationName, StationCode, StationLocID, ReadingTypesID, Owner1ID,
            RealTime, Active, WebLink, MesowestLink, TransmitTime, 
            Owner2ID, MaintainerID, ProjectID, DataProviderID, ContactID
        ))
        if do_commit:
            self.connection.commit()

    def insert_record_ReadingTypes_table(
            self,
            Hydrologic:bool|None=None,
            Weather:bool|None=None,
            Coastal:bool|None=None,
            ExperimentalPlot:bool|None=None,
            Thermometer:bool|None=None,
            Seismometer:bool|None=None,
            Dewpoint:bool|None=None,
            Wind:bool|None=None,
            Visibility:bool|None=None,
            SkyConditions:bool|None=None,
            SeaLevelPressure:bool|None=None,
            WaveSwellHeight:bool|None=None,
            Altimeter:bool|None=None,
            SnowAmount:bool|None=None,
            Heated:bool|None=None,
            Seasonal:bool|None=None,
            ReliablePrecip:bool|None=None,
            ReliableForcsting:bool|None=None,
            ReliableDewPoint:bool|None=None,
            ReliableWind:bool|None=None,
            ReliableTemp:bool|None=None,
            AdditnInfo:str|None=None,
            do_commit=True
            ):
        """
        Inserts a record into the ReadingTypes table
        """
        command = """
            INSERT INTO ReadingTypes
                (Hydrologic, Weather, Coastal, ExperimentalPlot, 
                Thermometer, Seismometer, Dewpoint, Wind, Visibility,
                SkyConditions, SeaLevelPressure, WaveSwellHeight, Altimeter,
                SnowAmount, Heated, Seasonal, ReliablePrecip, ReliableForcsting,
                ReliableDewPoint, ReliableWind, ReliableTemp, AdditnInfo)
            Values (?, ?, ?, ?,   ?, ?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?, ?, ?,   ?, ?, ?, ?)
            """
        
        self.cursor.execute(command, (
            Hydrologic, Weather, Coastal, ExperimentalPlot,
            Thermometer, Seismometer, Dewpoint, Wind, Visibility,
            SkyConditions, SeaLevelPressure, WaveSwellHeight, Altimeter,
            SnowAmount, Heated, Seasonal, ReliablePrecip, ReliableForcsting,
            ReliableDewPoint, ReliableWind, ReliableTemp, AdditnInfo
        ))
        if do_commit:
            self.connection.commit()
    
    def insert_record_StationLocations_table(
            self,
            Latitude:float,
            Longitude:float,
            ElevationFT:int|None=None,
            do_commit=True
            ):
        """
        Inserts a record into the StationLocations table
        """
        command = """
            INSERT INTO StationLocations
                (Latitude, Longitude, ElevationFT)
            Values (?, ?, ?)
            """
        
        self.cursor.execute(command, (
            Latitude, Longitude, ElevationFT
        ))
        if do_commit:
            self.connection.commit()

    def insert_record_Contacts_table(
            self,
            ContactName:str,
            ContactEmail:str,
            do_commit=True
            ):
        """
        Inserts a record into the Contacts table
        """
        command = """
            INSERT INTO Contacts
                (ContactName, ContactEmail)
            Values (?, ?)
            """
        
        self.cursor.execute(command, (ContactName, ContactEmail))
        if do_commit:
            self.connection.commit()

    def insert_record_DataProviders_table(
            self,
            ProviderName:str,
            do_commit=True
            ):
        """
        Inserts a record into the DataProviders table
        """
        command = """
            INSERT INTO DataProviders
                (ProviderName)
            Values (?)
            """
        
        self.cursor.execute(command, (ProviderName,))
        if do_commit:
            self.connection.commit()

    def insert_record_Owner1_table(
            self,
            Owner1Name:str,
            do_commit=True
            ):
        """
        Inserts a record into the Owner1 table
        """
        command = """
            INSERT INTO Owner1
                (Owner1Name)
            Values (?)
            """
        
        self.cursor.execute(command, (Owner1Name,))
        if do_commit:
            self.connection.commit()

    def insert_record_Owner2_table(
            self,
            Owner2Name:str,
            do_commit=True
            ):
        """
        Inserts a record into the Owner2 table
        """
        command = """
            INSERT INTO Owner2
                (Owner2Name)
            Values (?)
            """
        
        self.cursor.execute(command, (Owner2Name,))
        if do_commit:
            self.connection.commit()

    def insert_record_Maintainers_table(
            self,
            MaintainerName:str,
            do_commit=True
            ):
        """
        Inserts a record into the Maintainers table
        """
        command = """
            INSERT INTO Maintainers
                (MaintainerName)
            Values (?)
            """
        
        self.cursor.execute(command, (MaintainerName,))
        if do_commit:
            self.connection.commit()

    def insert_record_Projects_table(
            self,
            ProjectName:str,
            do_commit=True
            ):
        """
        Inserts a record into the Projects table
        """
        command = """
            INSERT INTO Projects
                (ProjectName)
            Values (?)
            """
        
        self.cursor.execute(command, (ProjectName,))
        if do_commit:
            self.connection.commit()

    # ====================
    # Select Table Records
    # ====================

    def select_records_Stations(self):
        self.cursor.execute('SELECT * FROM Stations')
        records = self.cursor.fetchall()
        return records
    
    def select_records_ReadingTypes(self):
        self.cursor.execute('SELECT * FROM ReadingTypes')
        records = self.cursor.fetchall()
        return records
    
    def select_records_StationLocations(self):
        self.cursor.execute('SELECT * FROM StationLocations')
        records = self.cursor.fetchall()
        return records
    
    def select_records_Contacts(self):
        self.cursor.execute('SELECT * FROM Contacts')
        records = self.cursor.fetchall()
        return records
    
    def select_records_DataProviders(self):
        self.cursor.execute('SELECT * FROM DataProviders')
        records = self.cursor.fetchall()
        return records
    
    def select_records_Owner1(self):
        self.cursor.execute('SELECT * FROM Owner1')
        records = self.cursor.fetchall()
        return records
    
    def select_records_Owner2(self):
        self.cursor.execute('SELECT * FROM Owner2')
        records = self.cursor.fetchall()
        return records
    
    def select_records_Maintainers(self):
        self.cursor.execute('SELECT * FROM Maintainers')
        records = self.cursor.fetchall()
        return records
    
    def select_records_Projects(self):
        self.cursor.execute('SELECT * FROM Projects')
        records = self.cursor.fetchall()
        return records
    
