// Blocks admin pages for anyone who isn't a logged-in admin, sending them to the login page
// (with ?next= so they come back after logging in). A login that isn't in the admins table sees a
// "not an admin account" message there.
// This only hides pages: the real protection is on the server, which refuses admin actions
// from anyone not in the admins table.

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalApi } from '../services/portal-api';

export const adminGuard: CanActivateFn = async (_route, state) => {
  const api = inject(PortalApi);
  const router = inject(Router);
  if ((await api.getUser()) && (await api.checkAdmin())) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};
