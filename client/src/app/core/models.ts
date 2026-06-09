/**
 * TypeScript mirrors of the server DTOs and enums.
 *
 * IMPORTANT: enum integer values MUST match the server exactly
 * (architecture.md §5.1 / §10.3). Enums travel on the wire as integers.
 */

/** Server: Role { Admin = 0, Worker = 1 } */
export enum Role {
  Admin = 0,
  Worker = 1,
}

/** Server: FieldTaskStatus { Created = 0, InProgress = 1, Done = 2, Verified = 3 } */
export enum FieldTaskStatus {
  Created = 0,
  InProgress = 1,
  Done = 2,
  Verified = 3,
}

/** Server: Priority { Low = 0, Medium = 1, High = 2, Urgent = 3 } */
export enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
  Urgent = 3,
}

/** UserDto { id, username, displayName, role } (arch §9) */
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

/**
 * TaskDto { id, title, description?, icon, priority, labels[], latitude,
 *           longitude, area?, assigneeId, assigneeName, deadline(UTC), status,
 *           attachmentCount, createdAtUtc, updatedAtUtc }
 * Dates arrive as ISO-8601 strings over JSON; `icon` is always present
 * server-side (defaulted), `labels` is always an array (possibly empty).
 *
 * `area` is an optional polygon: an array of `[latitude, longitude]` pairs
 * (server `double[][]?`). null/absent when the task has no area; the server
 * treats a polygon with fewer than 3 vertices as "no area".
 */
export interface FieldTask {
  id: string;
  title: string;
  description?: string | null;
  icon: string;
  priority: Priority;
  labels: string[];
  latitude: number;
  longitude: number;
  area?: number[][] | null;
  assigneeId: string;
  assigneeName: string;
  deadline: string;
  status: FieldTaskStatus;
  attachmentCount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * AttachmentDto { id, taskId, fileName, contentType, sizeBytes, isImage,
 *                 uploadedById, uploadedByName, uploadedAtUtc, url }
 * `url` is the API content path (GET .../content); it requires the bearer
 * token, so render it through AttachmentService.fetchBlobUrl / app-auth-image.
 */
export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  uploadedById: string;
  uploadedByName: string;
  uploadedAtUtc: string;
  url: string;
}

/** CommentDto { id, taskId, authorId, authorName, body, createdAtUtc } (arch §9) */
export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAtUtc: string;
}

/** AuthResponse { token, user } (arch §9 / POST /api/auth/login) */
export interface AuthResponse {
  token: string;
  user: User;
}

/* ----- Request payloads (arch §9) ----- */

/** POST /api/auth/login */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/auth/register — no `role` field by design (over-posting defense). */
export interface RegisterRequest {
  username: string;
  password: string;
  displayName?: string;
}

/**
 * POST /api/tasks.
 * `icon`/`priority`/`labels` are optional on the wire (server defaults them):
 * omit `icon` to take the server default, `priority` to Low, `labels` to [].
 */
export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  icon?: string | null;
  priority?: Priority | null;
  labels?: string[] | null;
  latitude: number;
  longitude: number;
  /** Optional polygon: array of [latitude, longitude] pairs; null/omit for none. */
  area?: number[][] | null;
  assigneeId: string;
  deadline: string;
}

/** PUT /api/tasks/{id} — status & location are NOT editable here. */
export interface UpdateTaskRequest {
  title: string;
  description?: string | null;
  icon?: string | null;
  priority?: Priority | null;
  labels?: string[] | null;
  /** Optional polygon: array of [latitude, longitude] pairs; null/omit for none. */
  area?: number[][] | null;
  assigneeId: string;
  deadline: string;
}

/** PATCH /api/tasks/{id}/status */
export interface UpdateStatusRequest {
  status: FieldTaskStatus;
}

/** PATCH /api/tasks/{id}/location */
export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
}

/** PATCH /api/tasks/{id}/assignee */
export interface UpdateAssigneeRequest {
  assigneeId: string;
}

/** POST /api/tasks/{id}/comments */
export interface CreateCommentRequest {
  body: string;
}

/**
 * GET /api/tasks query params (arch §9.2).
 * - search: case-insensitive substring on title OR description
 * - status: single FieldTaskStatus filter (omit = all)
 * - assigneeId: Admin-only filter (ignored server-side for Workers)
 */
export interface TaskQuery {
  search?: string;
  status?: FieldTaskStatus;
  assigneeId?: string;
}

/** Decoded JWT claim shape (arch §7.1). */
export interface JwtClaims {
  /** subject = user id (GUID) */
  sub: string;
  /** role claim — string name "Admin" | "Worker" */
  role?: string;
  /** display name */
  name?: string;
  /** standard expiry (seconds since epoch) */
  exp?: number;
  iss?: string;
  aud?: string;
}
