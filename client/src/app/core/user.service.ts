import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Role, User } from './models';

/**
 * User API client (arch §9.4). Admin-only on the server.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  /** GET /api/users?role=1 — Workers, for the assignee dropdown. */
  listWorkers(): Observable<User[]> {
    const params = new HttpParams().set('role', String(Role.Worker));
    return this.http.get<User[]>('/api/users', { params });
  }
}
