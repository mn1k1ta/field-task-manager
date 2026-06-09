import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { concat, toArray } from 'rxjs';
import * as L from 'leaflet';

import { TaskService } from '../../core/task.service';
import { CommentService } from '../../core/comment.service';
import { AttachmentService } from '../../core/attachment.service';
import { AuthService } from '../../core/auth.service';
import { Attachment, Comment, FieldTask, FieldTaskStatus } from '../../core/models';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PriorityChipComponent } from '../../shared/priority-chip.component';
import { AuthImageComponent } from '../../shared/auth-image.component';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import {
  AreaPolygon,
  isValidArea,
  statusAreaPolygon,
  statusDivIcon,
} from '../../shared/leaflet-marker.util';
import { resolveIcon } from '../../shared/marker-icons';
import { formatBytes } from '../../shared/file-size.util';
import { TranslationService } from '../../core/i18n/translation.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * S4 Task Detail — Jira-style (arch §10.4, §8, UX §4.3).
 *
 * Header: icon glyph + title + status badge + priority chip + label chips.
 * Body: the Markdown description rendered as styled prose, an attachments
 * section (image thumbnails opened full-size via blob, non-image download
 * chips, inline upload + delete for the uploader/Admin), the read-only Leaflet
 * map, the comment thread, and role-gated status-action buttons.
 *
 * Status action gating is conditional on role + status + ownership (arch §8.1):
 *   - Worker (assignee): Start (Created→InProgress), Mark Done (InProgress→Done)
 *   - Admin: Verify (when Done), Reopen (when Done/Verified), plus Edit + Delete
 * The server re-enforces every action; a 403/404 resyncs the UI to server truth.
 */
@Component({
  selector: 'app-task-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    StatusBadgeComponent,
    PriorityChipComponent,
    AuthImageComponent,
    MarkdownPipe,
    TranslatePipe,
  ],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
})
export class TaskDetailComponent {
  private readonly taskService = inject(TaskService);
  private readonly commentService = inject(CommentService);
  private readonly attachmentService = inject(AttachmentService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);

  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('detailMap');

  protected readonly FieldTaskStatus = FieldTaskStatus;

  /** Active UI language — bound to DatePipe locale so dates localize live. */
  protected readonly lang = this.i18n.current;

  private readonly taskId = this.route.snapshot.paramMap.get('id') ?? '';

  /* ---- State ---- */
  protected readonly task = signal<FieldTask | null>(null);
  protected readonly comments = signal<Comment[]>([]);
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly posting = signal(false);
  protected readonly confirmingDelete = signal(false);

  /* ---- Attachment UI state ---- */
  protected readonly dragging = signal(false);
  protected readonly uploading = signal(false);
  protected readonly attachmentError = signal<string | null>(null);
  /** Object URL for the full-size image lightbox, or null when closed. */
  protected readonly lightboxUrl = signal<string | null>(null);
  protected readonly lightboxAlt = signal('');

  protected readonly imageAttachments = computed(() => this.attachments().filter((a) => a.isImage));
  protected readonly fileAttachments = computed(() => this.attachments().filter((a) => !a.isImage));

  protected readonly headerIcon = computed(() => resolveIcon(this.task()?.icon));

  protected readonly commentCtrl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  private readonly currentUser = this.auth.currentUser;

  /* ---- Role / ownership derived flags ---- */
  protected readonly isAdmin = this.auth.isAdmin;

  protected readonly isAssignee = computed(() => {
    const t = this.task();
    const u = this.currentUser();
    return !!t && !!u && t.assigneeId === u.id;
  });

  /** True when the current user may add files (assignee on own task, or Admin). */
  protected readonly canUpload = computed(() => this.isAdmin() || this.isAssignee());

  /** True when the current user may delete a given attachment (uploader or Admin). */
  protected canDeleteAttachment(att: Attachment): boolean {
    const u = this.currentUser();
    return this.isAdmin() || (!!u && att.uploadedById === u.id);
  }

  /** Worker forward actions (assignee only). */
  protected readonly canStart = computed(
    () => this.isAssignee() && this.task()?.status === FieldTaskStatus.Created,
  );
  protected readonly canMarkDone = computed(
    () => this.isAssignee() && this.task()?.status === FieldTaskStatus.InProgress,
  );

  /** Admin gate actions. */
  protected readonly canVerify = computed(
    () => this.isAdmin() && this.task()?.status === FieldTaskStatus.Done,
  );
  protected readonly canReopen = computed(() => {
    const s = this.task()?.status;
    return this.isAdmin() && (s === FieldTaskStatus.Done || s === FieldTaskStatus.Verified);
  });

  /** Quiet note shown when the current role has no available transition. */
  protected readonly statusNote = computed<string | null>(() => {
    const t = this.task();
    if (!t) {
      return null;
    }
    if (!this.isAdmin() && this.isAssignee()) {
      if (t.status === FieldTaskStatus.Done) {
        return this.i18n.t('detail.waitingVerification');
      }
      if (t.status === FieldTaskStatus.Verified) {
        return this.i18n.t('detail.verifiedClosed');
      }
    }
    return null;
  });

  /* ---- Leaflet (read-only marker) ---- */
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  /** Read-only status-colored area polygon (if the task has one). */
  private areaPolygon: L.Polygon | null = null;

  constructor() {
    if (!this.taskId) {
      this.error.set(this.i18n.t('detail.errorNotFound'));
      this.loading.set(false);
    } else {
      this.loadTask();
      this.loadComments();
      this.loadAttachments();
    }

    afterNextRender(() => this.tryInitMap());

    this.destroyRef.onDestroy(() => {
      this.clearArea();
      this.map?.remove();
      this.map = null;
      this.closeLightbox();
    });
  }

  /* ---- Loading ---- */

  private loadTask(): void {
    this.loading.set(true);
    this.error.set(null);
    this.taskService
      .get(this.taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.loading.set(false);
          this.task.set(t);
          this.tryInitMap();
          this.updateMarker(t);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(
            this.i18n.t(
              err.status === 404 ? 'detail.errorNotAvailable' : 'detail.errorLoadFailed',
            ),
          );
        },
      });
  }

  private loadComments(): void {
    this.commentService
      .list(this.taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this.comments.set(c),
        error: () => {
          /* comment-load failures are non-fatal; the task still shows */
        },
      });
  }

  private loadAttachments(): void {
    this.attachmentService
      .list(this.taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (a) => this.attachments.set(a),
        error: () => {
          /* attachment-load failures are non-fatal */
        },
      });
  }

  /** Reload task + comments after a mutation (status, comment, etc.). */
  private refresh(): void {
    this.taskService.get(this.taskId).subscribe({
      next: (t) => {
        this.task.set(t);
        this.updateMarker(t);
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.actionError.set(this.i18n.t('detail.errorNotAvailable'));
        }
      },
    });
    this.loadComments();
  }

  /* ---- Status actions ---- */

  protected start(): void {
    this.transition(FieldTaskStatus.InProgress);
  }
  protected markDone(): void {
    this.transition(FieldTaskStatus.Done);
  }
  protected verify(): void {
    this.transition(FieldTaskStatus.Verified);
  }
  protected reopen(): void {
    this.transition(FieldTaskStatus.InProgress);
  }

  private transition(target: FieldTaskStatus): void {
    this.actionError.set(null);
    this.busy.set(true);
    this.taskService.setStatus(this.taskId, target).subscribe({
      next: (t) => {
        this.busy.set(false);
        this.task.set(t);
        this.updateMarker(t);
        this.loadComments(); // status changes append an audit comment (arch §8.3)
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.handleActionError(err);
      },
    });
  }

  /* ---- Comments ---- */

  protected postComment(): void {
    const body = this.commentCtrl.value.trim();
    if (!body) {
      this.commentCtrl.markAsTouched();
      return;
    }
    this.actionError.set(null);
    this.posting.set(true);
    this.commentService.add(this.taskId, body).subscribe({
      next: (c) => {
        this.posting.set(false);
        this.comments.update((list) => [...list, c]);
        this.commentCtrl.reset('');
      },
      error: (err: HttpErrorResponse) => {
        this.posting.set(false);
        this.handleActionError(err);
      },
    });
  }

  protected get commentInvalid(): boolean {
    return this.commentCtrl.invalid && this.commentCtrl.touched;
  }

  /* ---- Attachments ---- */

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length) {
      this.upload(Array.from(files));
    }
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.upload(Array.from(input.files));
    }
    input.value = '';
  }

  private upload(files: File[]): void {
    if (!this.canUpload()) {
      return;
    }
    this.attachmentError.set(null);
    this.uploading.set(true);
    concat(...files.map((f) => this.attachmentService.upload(this.taskId, f)))
      .pipe(toArray(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.uploading.set(false);
          this.attachments.update((list) => [...list, ...created]);
        },
        error: (err: HttpErrorResponse) => {
          this.uploading.set(false);
          if (err.status === 413 || err.status === 400) {
            this.attachmentError.set(this.i18n.t('attachment.errorTooLarge'));
          } else if (err.status === 403) {
            this.attachmentError.set(this.i18n.t('attachment.errorForbidden'));
          } else {
            this.attachmentError.set(this.i18n.t('attachment.errorUploadFailed'));
          }
        },
      });
  }

  protected deleteAttachment(att: Attachment): void {
    this.attachmentError.set(null);
    this.attachmentService
      .delete(this.taskId, att.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.attachments.update((list) => list.filter((a) => a.id !== att.id)),
        error: (err: HttpErrorResponse) =>
          this.attachmentError.set(
            this.i18n.t(
              err.status === 403
                ? 'attachment.errorDeleteOwnOnly'
                : 'attachment.errorRemoveFailed',
            ),
          ),
      });
  }

  /** Open an image full-size in a blob-backed lightbox. */
  protected openImage(att: Attachment): void {
    this.attachmentService
      .fetchBlobUrl(att.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (url) => {
          this.closeLightbox();
          this.lightboxUrl.set(url);
          this.lightboxAlt.set(att.fileName);
        },
        error: () => this.attachmentError.set(this.i18n.t('attachment.errorOpenImage')),
      });
  }

  protected closeLightbox(): void {
    const url = this.lightboxUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
    this.lightboxUrl.set(null);
    this.lightboxAlt.set('');
  }

  /** Download a non-image file: fetch the blob, then trigger a save. */
  protected download(att: Attachment): void {
    this.attachmentService
      .fetchBlobUrl(att.url)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (url) => {
          const a = document.createElement('a');
          a.href = url;
          a.download = att.fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          // The href is owned here; revoke after the click is dispatched.
          setTimeout(() => URL.revokeObjectURL(url), 0);
        },
        error: () => this.attachmentError.set(this.i18n.t('attachment.errorDownload')),
      });
  }

  protected formatSize(bytes: number): string {
    return formatBytes(bytes);
  }

  /* ---- Delete task (Admin) ---- */

  protected askDelete(): void {
    this.confirmingDelete.set(true);
  }
  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  protected confirmDelete(): void {
    this.actionError.set(null);
    this.busy.set(true);
    this.taskService.remove(this.taskId).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.confirmingDelete.set(false);
        this.handleActionError(err);
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/dashboard']);
  }

  private handleActionError(err: HttpErrorResponse): void {
    if (err.status === 403) {
      this.actionError.set(this.i18n.t('detail.errorActionNotAllowed'));
      this.refresh();
    } else if (err.status === 404) {
      this.actionError.set(this.i18n.t('detail.errorNotAvailable'));
      this.refresh();
    } else if (err.status === 400) {
      // Prefer the server's human-readable detail; otherwise a localized fallback.
      this.actionError.set(err.error?.detail ?? this.i18n.t('detail.errorActionFailed'));
      this.refresh();
    } else {
      this.actionError.set(this.i18n.t('detail.errorServerUnreachable'));
    }
  }

  /* ---- Leaflet ---- */

  private tryInitMap(): void {
    const el = this.mapEl()?.nativeElement;
    const t = this.task();
    if (!el || this.map || !t) {
      return;
    }
    this.map = L.map(el, {
      center: [t.latitude, t.longitude],
      zoom: 15,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: false,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.updateMarker(t);
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private updateMarker(t: FieldTask): void {
    if (!this.map) {
      return;
    }
    const pos: L.LatLngExpression = [t.latitude, t.longitude];
    if (this.marker) {
      this.marker.setLatLng(pos).setIcon(statusDivIcon(t.status, { icon: t.icon }));
    } else {
      this.marker = L.marker(pos, { icon: statusDivIcon(t.status, { icon: t.icon }) }).addTo(
        this.map,
      );
    }
    // Refresh the area polygon (status color may have changed after a transition).
    this.clearArea();
    if (isValidArea(t.area)) {
      this.areaPolygon = statusAreaPolygon(t.area as AreaPolygon, t.status).addTo(this.map);
    }
    this.map.setView(pos, this.map.getZoom());
  }

  /** Remove the area polygon layer if present (no leaks). */
  private clearArea(): void {
    if (this.areaPolygon && this.map) {
      this.map.removeLayer(this.areaPolygon);
    }
    this.areaPolygon = null;
  }
}
