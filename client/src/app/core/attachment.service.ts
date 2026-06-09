import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Attachment } from './models';

/**
 * Attachment API client.
 *
 * Routes are nested under a task: /api/tasks/{taskId}/attachments
 * (see AttachmentsController). Upload is multipart/form-data with the file
 * under the field name `file`. The bearer token is attached by the auth
 * interceptor, including for the binary content fetch.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private readonly http = inject(HttpClient);

  private baseFor(taskId: string): string {
    return `/api/tasks/${taskId}/attachments`;
  }

  /** GET .../attachments — list a task's attachments, oldest → newest. */
  list(taskId: string): Observable<Attachment[]> {
    return this.http.get<Attachment[]>(this.baseFor(taskId));
  }

  /**
   * POST .../attachments — upload one file (multipart/form-data, field `file`).
   * Returns the created AttachmentDto. Max 10 MB enforced server-side.
   */
  upload(taskId: string, file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Attachment>(this.baseFor(taskId), form);
  }

  /** DELETE .../attachments/{attId} — remove (uploader or Admin only). */
  delete(taskId: string, attachmentId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseFor(taskId)}/${attachmentId}`);
  }

  /**
   * GET an attachment's binary content (the DTO `url`, e.g.
   * `/api/tasks/{id}/attachments/{attId}/content`) as a blob and wrap it in a
   * short-lived object URL suitable for an <img src> or download link.
   *
   * The interceptor adds the bearer token. The CALLER owns the returned URL
   * and MUST `URL.revokeObjectURL` it once it is no longer displayed
   * (app-auth-image does this on destroy).
   */
  fetchBlobUrl(url: string): Observable<string> {
    return this.http
      .get(url, { responseType: 'blob' })
      .pipe(map((blob: Blob) => URL.createObjectURL(blob)));
  }
}
