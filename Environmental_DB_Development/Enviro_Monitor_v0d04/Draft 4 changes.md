# **Draft 4**

## **Draft 3 pains**

* Government level can be misconstrued. Keep the gov info to US gov, State Gov, Tribal Gov, Foreign Gov
* Longitude/latitude PostGIS object is cool, but should also be available in a more accessible form. - Maybe pre-plan some views?
* Observation type -> Sensor itself
* Stations AND sensors can have specs/model info
* Contacts are tied to roles and organizations, not just organizations.

# 

## **Draft 4 changes**

### StationSites
* Renamed *Location* column to *ComplexCoordinateLocation*
* Added *Longitude* and *Latitude* columns
* Added *SiteNotes* column, TEXT datatype

### Organizations
* Removed *GovernmentType* column
* Altered organization_type ENUM -> {nonprofit, private_company, university, tribal_gov, federal_gov, state_gov, international_gov}

### StationOrganizationsRoles -> StationOrganizationRole
* Renamed **StationOrganizationRole**
* Removed *Role* with ENUM
* New column *RoleID* references **StationRoles**

### (NEW) StationRoles
* Columns *RoleID*, *RoleTitle*

### OrganizationProjects
* Added *ProjectNotes* column

### OrganizationContacts -> Contacts
* Renamed **Contacts**
* Split *Name* column into *FirstName*, *LastName*

### (NEW) StationContact
* Columns *StationID*(PK), *ConcactID*, *RoleID*

### ObservationTypes
* Now links to **Sensors** via the **SensorObservations** linking table

### (NEW) SensorObservations
* Columns *SensorID*, *ObservationTypeID*, *ObservationQualityFlag*
* *ObservationQualityFlag* is a renamed ENUM from now-removed **SensorCapabilities** {unknown, reliable, questionable, unreliable}

### (REMOVED) SensorCapabilities

### Units -> MeasurementUnits
* Renamed to **MeasurementUnits**
* Renamed PK to **MeasurementUnitsID**
* Linked to **Sensors** with **SensorReportedUnits**

### Sensors
* Broke off *Manufacturer* and *ModelNumber* columns. Now **Sensors** references **DeviceSpecifications** with the **SensorsToSpecs** linking table

### Stations
* Now **Sensors** references **DeviceSpecifications** with the **StationsToSpecs** linking table

### (NEW) DeviceSpecifications
* Columns *DevicesSpecificationID*, *ManufacturerID*, *ModelNumber*, *ModelName*

### (NEW) DeviceManufacturers
* Columns *ManufacturerID*, *ManufacturerName*
