import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Functional HTTP interceptor (arch §10.2).
 *
 * - Attaches `Authorization: Bearer <token>` when a token is present.
 * - On a 401 response, clears auth and redirects to /login (hard re-login,
 *   no refresh token — PRD §12.1 / UX §6.3).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Don't loop on the login/register calls themselves.
      const isAuthCall = req.url.includes('/api/auth/');
      if (err.status === 401 && !isAuthCall) {
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
