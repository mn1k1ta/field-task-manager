import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/**
 * authGuard (arch §10.2): require an authenticated user.
 * Redirects to /login when not logged in.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};

/**
 * adminGuard (arch §10.2): require the Admin role.
 * Redirects to /dashboard for non-Admins (UI hiding; server is the real
 * boundary per NFR-2).
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.currentUser()?.role === Role.Admin) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
