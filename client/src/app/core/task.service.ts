import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateTaskRequest,
  FieldTask,
  FieldTaskStatus,
  TaskQuery,
  UpdateAssigneeRequest,
  UpdateLocationRequest,
  UpdateStatusRequest,
  UpdateTaskRequest,
} from './models';

/**
 * Task API client (arch §9.2 / §10.3). All routes under /api/tasks.
 */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/tasks';

  /** GET /api/tasks — role-scoped list with optional search/status/assignee. */
  list(query: TaskQuery = {}): Observable<FieldTask[]> {
    let params = new HttpParams();
    if (query.search !== undefined && query.search !== null && query.search !== '') {
      params = params.set('search', query.search);
    }
    if (query.status !== undefined && query.status !== null) {
      params = params.set('status', String(query.status));
    }
    if (query.assigneeId !== undefined && query.assigneeId !== null && query.assigneeId !== '') {
      params = params.set('assigneeId', query.assigneeId);
    }
    return this.http.get<FieldTask[]>(this.base, { params });
  }

  /** GET /api/tasks/{id} — single task (ownership-checked server-side). */
  get(id: string): Observable<FieldTask> {
    return this.http.get<FieldTask>(`${this.base}/${id}`);
  }

  /**
   * POST /api/tasks — create (Admin only).
   * `dto` carries icon/priority/labels/area straight through to the server
   * (optional — omitted fields take the server defaults; `area` is the
   * optional polygon of [lat, lng] pairs).
   */
  create(dto: CreateTaskRequest): Observable<FieldTask> {
    return this.http.post<FieldTask>(this.base, dto);
  }

  /**
   * PUT /api/tasks/{id} — edit fields (Admin only).
   * `dto` carries icon/priority/labels/area straight through to the server.
   */
  update(id: string, dto: UpdateTaskRequest): Observable<FieldTask> {
    return this.http.put<FieldTask>(`${this.base}/${id}`, dto);
  }

  /** DELETE /api/tasks/{id} — delete + cascade comments (Admin only). */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** PATCH /api/tasks/{id}/status — transition (validated server-side per §8). */
  setStatus(id: string, status: FieldTaskStatus): Observable<FieldTask> {
    const body: UpdateStatusRequest = { status };
    return this.http.patch<FieldTask>(`${this.base}/${id}/status`, body);
  }

  /** PATCH /api/tasks/{id}/location — move marker (Admin only). */
  setLocation(id: string, lat: number, lng: number): Observable<FieldTask> {
    const body: UpdateLocationRequest = { latitude: lat, longitude: lng };
    return this.http.patch<FieldTask>(`${this.base}/${id}/location`, body);
  }

  /** PATCH /api/tasks/{id}/assignee — reassign (Admin only). */
  setAssignee(id: string, assigneeId: string): Observable<FieldTask> {
    const body: UpdateAssigneeRequest = { assigneeId };
    return this.http.patch<FieldTask>(`${this.base}/${id}/assignee`, body);
  }
}
