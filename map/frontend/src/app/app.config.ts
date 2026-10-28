/**
 * @fileoverview Application-wide providers for the map app.
 *
 * Usage: passed to `bootstrapApplication` in `main.ts`. Add global providers
 * (HTTP interceptors, etc.) here.
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes), provideHttpClient()],
};
