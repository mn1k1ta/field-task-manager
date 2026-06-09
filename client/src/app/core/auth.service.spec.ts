import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthResponse, Role, User } from './models';

const TOKEN_KEY = 'ftm.token';

/**
 * Build a non-signed JWT (header.payload.signature) with the given claims.
 * AuthService never verifies the signature — it only base64url-decodes the
 * payload — so a fake signature is fine for these unit tests.
 */
function makeJwt(claims: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.sig`;
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600;
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600;

describe('AuthService', () => {
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  function setup(): AuthService {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    http?.verify();
    localStorage.clear();
  });

  describe('login', () => {
    it('POSTs credentials, stores the token and decodes claims into currentUser', () => {
      const auth = setup();
      const token = makeJwt({ sub: 'user-1', role: 'Admin', name: 'Alice', exp: FUTURE_EXP });
      const body: AuthResponse = {
        token,
        user: { id: 'user-1', username: 'alice', displayName: 'Alice', role: Role.Admin },
      };

      let received: AuthResponse | undefined;
      auth.login('alice', 'pw').subscribe((r) => (received = r));

      const req = http.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'alice', password: 'pw' });
      req.flush(body);

      expect(received).toEqual(body);
      expect(auth.token()).toBe(token);
      expect(localStorage.getItem(TOKEN_KEY)).toBe(token);
      expect(auth.isAuthenticated()).toBeTrue();

      const user = auth.currentUser() as User;
      expect(user.id).toBe('user-1');
      expect(user.displayName).toBe('Alice');
      expect(user.role).toBe(Role.Admin);
      expect(auth.isAdmin()).toBeTrue();
    });

    it('decodes a Worker role and isAdmin stays false', () => {
      const auth = setup();
      const token = makeJwt({ sub: 'w1', role: 'Worker', name: 'Bob', exp: FUTURE_EXP });
      auth.login('bob', 'pw').subscribe();
      http.expectOne('/api/auth/login').flush({
        token,
        user: { id: 'w1', username: 'bob', displayName: 'Bob', role: Role.Worker },
      });

      expect(auth.currentUser()?.role).toBe(Role.Worker);
      expect(auth.isAdmin()).toBeFalse();
    });

    it('falls back to sub for displayName when the name claim is absent', () => {
      const auth = setup();
      const token = makeJwt({ sub: 'no-name', role: 'Worker', exp: FUTURE_EXP });
      auth.login('x', 'y').subscribe();
      http.expectOne('/api/auth/login').flush({ token, user: {} as User });
      expect(auth.currentUser()?.displayName).toBe('no-name');
    });
  });

  describe('register', () => {
    it('POSTs username + password without a role field (over-posting defense)', () => {
      const auth = setup();
      auth.register('newbie', 'secret').subscribe();
      const req = http.expectOne('/api/auth/register');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'newbie', password: 'secret' });
      expect(req.request.body.role).toBeUndefined();
      req.flush({ id: 'n1', username: 'newbie', displayName: 'newbie', role: Role.Worker });
    });

    it('includes displayName only when provided', () => {
      const auth = setup();
      auth.register('newbie', 'secret', 'New Bie').subscribe();
      const req = http.expectOne('/api/auth/register');
      expect(req.request.body).toEqual({
        username: 'newbie',
        password: 'secret',
        displayName: 'New Bie',
      });
      req.flush({ id: 'n1', username: 'newbie', displayName: 'New Bie', role: Role.Worker });
    });
  });

  describe('logout', () => {
    it('clears storage + state and navigates to /login', () => {
      const auth = setup();
      const token = makeJwt({ sub: 'u', role: 'Admin', exp: FUTURE_EXP });
      auth.login('a', 'b').subscribe();
      http.expectOne('/api/auth/login').flush({ token, user: {} as User });
      expect(auth.isAuthenticated()).toBeTrue();

      auth.logout();

      expect(auth.token()).toBeNull();
      expect(auth.currentUser()).toBeNull();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('rehydration from localStorage', () => {
    it('restores a non-expired token + user on construction', () => {
      localStorage.setItem(
        TOKEN_KEY,
        makeJwt({ sub: 'u9', role: 'Admin', name: 'Rehydrated', exp: FUTURE_EXP }),
      );
      const auth = setup();
      expect(auth.isAuthenticated()).toBeTrue();
      expect(auth.currentUser()?.id).toBe('u9');
      expect(auth.currentUser()?.displayName).toBe('Rehydrated');
      expect(auth.isAdmin()).toBeTrue();
    });

    it('clears an expired stored token and stays unauthenticated', () => {
      localStorage.setItem(TOKEN_KEY, makeJwt({ sub: 'old', role: 'Worker', exp: PAST_EXP }));
      const auth = setup();
      expect(auth.isAuthenticated()).toBeFalse();
      expect(auth.currentUser()).toBeNull();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });

    it('ignores a malformed stored token', () => {
      localStorage.setItem(TOKEN_KEY, 'not-a-jwt');
      const auth = setup();
      // A token with no decodable payload yields a null user → not authenticated.
      expect(auth.isAuthenticated()).toBeFalse();
    });
  });
});
