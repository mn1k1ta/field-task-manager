import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import {
  AuthResponse,
  JwtClaims,
  LoginRequest,
  RegisterRequest,
  Role,
  User,
} from './models';

const TOKEN_KEY = 'ftm.token';

/**
 * Signal-based auth state (arch §3.5, §10.3).
 *
 * Holds the JWT in localStorage and exposes a decoded `currentUser` signal.
 * Functional route guards and the HTTP interceptor read from here.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** The currently authenticated user, decoded from the JWT claims. */
  private readonly _currentUser = signal<User | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  /** True when an Admin is logged in (UI affordance gating only). */
  readonly isAdmin = computed(() => this._currentUser()?.role === Role.Admin);

  /** Raw JWT, kept in sync with localStorage. */
  private _token: string | null = null;

  constructor() {
    // Rehydrate from localStorage on construction (arch §10.3).
    const stored = this.readToken();
    if (stored && !this.isExpired(stored)) {
      this._token = stored;
      this._currentUser.set(this.userFromToken(stored));
    } else if (stored) {
      // Expired — clear stale token.
      this.clearStorage();
    }
  }

  /** Current bearer token (getter), or null when not authenticated. */
  token(): string | null {
    return this._token;
  }

  /** True when a non-expired token + decoded user are present. */
  isAuthenticated(): boolean {
    return this._currentUser() !== null && this._token !== null;
  }

  /** POST /api/auth/login — stores token + decodes claims into currentUser. */
  login(username: string, password: string): Observable<AuthResponse> {
    const body: LoginRequest = { username, password };
    return this.http.post<AuthResponse>('/api/auth/login', body).pipe(
      tap((res) => this.applyToken(res.token)),
    );
  }

  /**
   * POST /api/auth/register — self-register as Worker (server forces the role).
   * Returns the created user; the caller then logs in (arch §9.1).
   */
  register(username: string, password: string, displayName?: string): Observable<User> {
    const body: RegisterRequest = { username, password };
    if (displayName) {
      body.displayName = displayName;
    }
    return this.http.post<User>('/api/auth/register', body);
  }

  /** Clear storage + signal, navigate to /login. */
  logout(): void {
    this.clearStorage();
    this._token = null;
    this._currentUser.set(null);
    void this.router.navigate(['/login']);
  }

  /** Apply a freshly issued token: persist + decode into the user signal. */
  private applyToken(token: string): void {
    this._token = token;
    localStorage.setItem(TOKEN_KEY, token);
    this._currentUser.set(this.userFromToken(token));
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private clearStorage(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore storage failures */
    }
  }

  /** Decode the JWT payload (middle segment, base64url) into a User. */
  private userFromToken(token: string): User | null {
    const claims = this.decode(token);
    if (!claims || !claims.sub) {
      return null;
    }
    const role = claims.role === 'Admin' ? Role.Admin : Role.Worker;
    return {
      id: claims.sub,
      displayName: claims.name ?? claims.sub,
      username: claims.name ?? claims.sub,
      role,
    };
  }

  /** True when the token's `exp` claim is in the past. */
  private isExpired(token: string): boolean {
    const claims = this.decode(token);
    if (!claims?.exp) {
      // No exp claim — treat as non-expiring (server still validates).
      return false;
    }
    return claims.exp * 1000 <= Date.now();
  }

  /** atob the middle JWT segment and JSON-parse the claim set. */
  private decode(token: string): JwtClaims | null {
    try {
      const payload = token.split('.')[1];
      if (!payload) {
        return null;
      }
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(json) as JwtClaims;
    } catch {
      return null;
    }
  }
}
