/**
 * @fileoverview Application-wide providers for the portal app.
 *
 * Usage: passed to `bootstrapApplication` in `main.ts`. Add global providers
 * (HTTP client, interceptors, etc.) here.
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes)],
};
