"""
Database class - SQLite creation, table manipulation
"""

import sqlite3

class EnvironmentalSensorsDB:
    """
    
    """
    def __init__(self, database_name):
        """
        Connect to the database
        If the database doesn't exist, the database is created
        Autocommit is set to False, PRAGMA fk is ON
        """

        self.connection = sqlite3.connect(database_name, autocommit=False)
        print(f"Connected to {database_name}\n")
        self.cursor = self.connection.cursor()

        self.connection.execute('PRAGMA foreign_keys = ON')

        self.table_list = [
            'Stations', 'StationTypes', 
            'SensorTypes', 'StationSensors',
            'Organizations', 'StationOrganizations',
            'Contacts', 'StationContacts',
            'Tags', 'StationTags', 
            'QualityTypes', 'StationSensorQuality'
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
        Creates Stations home table
        """

        command = """
            CREATE TABLE Stations(
                StationID             INTEGER PRIMARY KEY,

                StationName           TEXT    NOT NULL,
                StationCode           TEXT,

                Latitude              REAL    NOT NULL,
                Longitude             REAL    NOT NULL,
                ElevationFT           INTEGER,

                IsActive              BOOLEAN,
                IsRealTime            BOOLEAN,

                TransmitTime          TEXT,
                WebLink               TEXT,
                MesowestLink          TEXT,

                Heated                BOOLEAN,
                Seasonal              BOOLEAN,

                AdditionalInformation TEXT,
                DeviceDetails         TEXT
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()
    
    def update_Stations_columns(self, col_name, ref_table, do_commit=False):
        """
        Updates Stations table with new reference key
        """
        command = f"""
            ALTER TABLE Stations
            ADD COLUMN {col_name} INTEGER
            REFERENCES {ref_table} ({col_name})
        """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationTypes_table(self, do_commit=True):
        """
        Creates StationTypes table
        """

        command = """
            CREATE TABLE StationTypes(
                StationTypeID INTEGER PRIMARY KEY,
                Name         TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        self.update_Stations_columns('StationTypeID', 'StationTypes')
        if do_commit:
            self.connection.commit()
    # =====================================
    # Sensor Types
    # temperature, precip, wind, dew, 
    # sea level pres, altimeter reading, 
    # snow amt, wave swell hgt, seismometer
    # =====================================

    def create_SensorTypes_table(self, do_commit=True):
        """
        Creates SensorTypes table
        """

        command = """
            CREATE TABLE SensorTypes(
                SensorTypeID INTEGER PRIMARY KEY,
                Name         TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationSensors_table(self, do_commit=True):
        """
        Creates StationSensors linking table
        """

        command = """
            CREATE TABLE StationSensors(
                StationID    INTEGER,
                SensorTypeID INTEGER,

                PRIMARY KEY (StationID, SensorTypeID),
                FOREIGN KEY (StationID) REFERENCES Stations(StationID),
                FOREIGN KEY (SensorTypeID) REFERENCES SensorTypes(SensorTypesID)
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    # ===============================
    # Organizations 
    # owners, maintainers, projects
    # ===============================
    def create_Organizations_table(self, do_commit=True):
        """
        Creates Organizations table
        """

        command = """
            CREATE TABLE Organizations(
                OrganizationID INTEGER PRIMARY KEY,
                Name           TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationOrganizations_table(self, do_commit=True):
        """
        Creates StationOrganizations linking table
        """

        command = """
            CREATE TABLE StationOrganizations(
                StationID      INTEGER,
                OrganizationID INTEGER,
                Role           TEXT,

                PRIMARY KEY (StationID, OrganizationID, Role),
                FOREIGN KEY (StationID) REFERENCES Stations(StationID),
                FOREIGN KEY (OrganizationID) REFERENCES Organizations(OrganizationID)
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    # ======================
    # Contacts
    # contact name and email
    # ======================

    def create_Contacts_table(self, do_commit=True):    
        """
        Creates Contacts table
        """

        command = """
            CREATE TABLE Contacts(
                ContactID INTEGER PRIMARY KEY,
                Name      TEXT,
                Email     TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationContacts_table(self, do_commit=True):    
        """
        Creates StationContacts linking table
        """

        command = """
            CREATE TABLE StationContacts(
                StationID INTEGER,
                ContactID INTEGER,

                PRIMARY KEY (StationID, ContactID),
                FOREIGN KEY (StationID) REFERENCES Stations(StationID),
                FOREIGN KEY (ContactID) REFERENCES Contacts(ContactID)
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    # =============================
    # Classification Tags
    # hydrologic, weather, coastal, 
    # experimentalplot, satellite
    # =============================

    def create_Tags_table(self, do_commit=True):
        """
        Creates Tags table
        """

        command = """
            CREATE TABLE Tags(
                TagID INTEGER PRIMARY KEY,
                Name  TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationTags_table(self, do_commit=True):
        """
        Creates StationTags linking table
        """

        command = """
            CREATE TABLE StationTags(
                StationID INTEGER,
                TagID INTEGER,

                PRIMARY KEY (StationID, TagID),
                FOREIGN KEY (StationID) REFERENCES Stations(StationID),
                FOREIGN KEY (TagID) REFERENCES Tags(TagID)
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    # ===============================
    # Data Qualities
    # reliable__, forecasting capable
    # ===============================

    def create_QualityTypes_table(self, do_commit=True):
        """
        Creates QualityTypes table
        """

        command = """
            CREATE TABLE QualityTypes(
                QualityTypesID INTEGER PRIMARY KEY,
                Name           TEXT    UNIQUE
            )
            """
        self.connection.execute(command)
        if do_commit:
            self.connection.commit()

    def create_StationSensorQuality_table(self, do_commit=True):
        """
        Creates StationSensorQuality linking table
        """

        command = """
            CREATE TABLE StationSensorQuality(
                StationID INTEGER,
                SensorTypeID INTEGER,
                QualityTypeID INTEGER,
                Value BOOLEAN,

                PRIMARY KEY (StationID, SensorTypeID, QualityTypeID),
                FOREIGN KEY (StationID) REFERENCES Stations(StationID),
                FOREIGN KEY (SensorTypeID) REFERENCES SensorTypes(SensorTypeID),
                FOREIGN KEY (QualityTypeID) REFERENCES QualityTypes(QualityTypeID)
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