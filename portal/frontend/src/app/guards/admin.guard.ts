// Blocks admin pages for anyone not logged in, sending them to the login page
// (with ?next= so they come back after logging in).
// This only hides pages: the real protection is on the server, which refuses admin actions without a login.

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalApi } from '../services/portal-api';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const api = inject(PortalApi);
  const router = inject(Router);
  if (await api.getUser()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};
