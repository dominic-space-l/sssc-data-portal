# Environmental Monitoring Database Web Portal
...
## Overview
...
## Architecture
...
### Backend
...
### Frontend
...
## Usage
### Quickstart
Prerequisites: [Node.js](https://nodejs.org/) 24 (`nvm use` reads the repo's `.nvmrc`).

From the **repo root**:

```sh
npm install           # installs frontend deps for every app (npm workspaces)
npm run start:portal  # starts the Angular dev server
```

Open http://localhost:4201. The portal runs on port 4201 so it can run alongside the map (4200).

The Angular app lives in `frontend/`. There's no need to install the Angular CLI globally: run CLI commands through npm from the repo root, for example `npm run ng -w portal-frontend -- generate component foo`.
### Troubleshooting
...
### Configuration
...
### Testing
...
### Development
...