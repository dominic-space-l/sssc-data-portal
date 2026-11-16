import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { Home } from './pages/home';
import { Login } from './pages/login';
import { RequestAccess } from './pages/request-access';
import { Submit } from './pages/submit';
import { AdminForms } from './pages/admin-forms';
import { AdminDashboard } from './pages/admin-dashboard';
import { OAuthConsent } from './pages/oauth-consent';

// Page addresses. /submit and /admin must match the SUBMIT_PATH and ADMIN_PATH secrets,
// because the server puts those addresses in links and alert emails.
// /oauth/consent must match "Authorization Path" in Supabase (Authentication -> OAuth Server).
export const routes: Routes = [
  { path: '', component: Home, title: 'Data Portal' },
  { path: 'login', component: Login, title: 'Admin login' },
  { path: 'request-access', component: RequestAccess, title: 'Request access' },
  { path: 'submit', component: Submit, title: 'Submit data' },
  { path: 'forms', component: AdminForms, canActivate: [adminGuard], title: 'Add data' },
  { path: 'admin', component: AdminDashboard, canActivate: [adminGuard], title: 'Dashboard' },
  { path: 'oauth/consent', component: OAuthConsent, canActivate: [adminGuard], title: 'Connect an app' },
  { path: '**', redirectTo: '' },
];
