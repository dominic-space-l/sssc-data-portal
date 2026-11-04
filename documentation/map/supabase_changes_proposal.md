# Proposal: Protecting Station Data for the Public Map

## Summary

The public map will show monitoring stations to anyone on the internet. To do that, the map needs to read from the station database. Without changes, the map's access key would let a determined visitor see **everything** in the database, including exact station locations, contact details, and internal notes.

I propose a set of changes that let the public map see only what it needs to display, with station locations deliberately blurred, while keeping the full data available to admin users.

## What we propose

1. **Track every database change.** Changes to the database's structure will be recorded and reviewed, like edits to a shared document with full version history. This lets us test changes safely before they affect the live data and undo them if needed.

2. **Connect related records properly.** The database will make sure that records refer to each other correctly. For example, a station can't be assigned to an organization that doesn't exist. Before this is switched on, we'll check for and fix any existing records that point to something missing.

3. **Lock the database to the public.** By default, the public will have no access to any part of the database.

4. **Blur station locations.** Each station's location will be shifted by 250–500 meters (roughly 1–3 city blocks) in a direction that's unique to that station. The shift stays the same over time, so the location can't be worked out by viewing the map repeatedly. Exact locations never leave the database for public visitors.

5. **Give the map a single, limited way in.** The map will be able to ask only two questions: "which stations should I show?" and "what filter options are there?" The answers include only the station's name, code, active status, blurred location, and its link to organizations, plus the lists of projects, organizations, and station types used for filtering. Notes, contacts, serial numbers, and equipment details are never included.

## What this means for you

**Benefits**

- Exact station locations, contact information, and internal notes stay private, even if someone inspects how the map works.
- Data quality improves, because the database rejects entries that refer to missing records.
- Every change to the database is documented and can be reviewed or reversed.

**Trade-offs**

- **Map locations are approximate.** Markers will appear up to about 500 meters from the actual station. This is intentional.
- **Some existing data may need tidying** before the changes can be applied. I'll identify any problem records if they pop up.

## Day-to-day impact

**Staff entering data:** The main difference is that the database will reject an entry that refers to something that doesn't exist (for example, a project ID that hasn't been created yet), and will say why. It will not silently fail.

**Public map visitors:** They'll see stations in approximately the right place, with filters working as planned.

**Future changes:**

- **Showing more on the map:** adding a new piece of information to the map (for example, install date) is a small, deliberate change made by a developer. This is on purpose, so private information can't end up on the map by accident.
- **Moving the markers:** if the blur distance is ever changed, every marker on the map will move.

## What we'll need from you

**Safekeeping a key.** The blurring uses a secret key stored securely inside the database. It's set up once. If it's lost, the map stops working until a new one is created, and every marker moves to a new blurred position. We'll hand over a copy for you to store somewhere safe, such as your organization's password manager.