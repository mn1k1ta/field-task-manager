import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Comment, CreateCommentRequest } from './models';

/**
 * Comment API client (arch §9.3). Nested under a task.
 */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly http = inject(HttpClient);

  /** GET /api/tasks/{id}/comments — oldest → newest (includes status audit). */
  list(taskId: string): Observable<Comment[]> {
    return this.http.get<Comment[]>(`/api/tasks/${taskId}/comments`);
  }

  /** POST /api/tasks/{id}/comments — add a comment (author = current user). */
  add(taskId: string, body: string): Observable<Comment> {
    const payload: CreateCommentRequest = { body };
    return this.http.post<Comment>(`/api/tasks/${taskId}/comments`, payload);
  }
}
