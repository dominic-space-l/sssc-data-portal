/**
 * @fileoverview Browser entry point for the portal app.
 *
 * Bootstraps the root `App` component with the providers in `app.config.ts`.
 * Usage: referenced as `browser` in angular.json; run with `npm run start:portal`.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
