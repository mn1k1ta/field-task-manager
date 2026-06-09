import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { adminGuard, authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Role, User } from './models';

/** Run a functional guard inside an injection context. */
function runGuard(guard: typeof authGuard): boolean | UrlTree {
  return TestBed.runInInjectionContext(
    () =>
      guard(
        {} as ActivatedRouteSnapshot,
        { url: '/x' } as RouterStateSnapshot,
      ) as boolean | UrlTree,
  );
}

const ADMIN: User = { id: 'a', username: 'admin', displayName: 'Admin', role: Role.Admin };
const WORKER: User = { id: 'w', username: 'worker', displayName: 'Worker', role: Role.Worker };

describe('authGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated', 'currentUser']);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  it('allows an authenticated user', () => {
    auth.isAuthenticated.and.returnValue(true);
    expect(runGuard(authGuard)).toBeTrue();
  });

  it('redirects to /login when unauthenticated', () => {
    auth.isAuthenticated.and.returnValue(false);
    const result = runGuard(authGuard);
    expect(result).toEqual(router.parseUrl('/login'));
  });
});

describe('adminGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated', 'currentUser']);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  it('allows an Admin', () => {
    auth.currentUser.and.returnValue(ADMIN);
    expect(runGuard(adminGuard)).toBeTrue();
  });

  it('redirects a Worker to /dashboard', () => {
    auth.currentUser.and.returnValue(WORKER);
    expect(runGuard(adminGuard)).toEqual(router.parseUrl('/dashboard'));
  });

  it('redirects an unauthenticated user to /dashboard', () => {
    auth.currentUser.and.returnValue(null);
    expect(runGuard(adminGuard)).toEqual(router.parseUrl('/dashboard'));
  });
});
