import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { concat, forkJoin, of, toArray } from 'rxjs';
import * as L from 'leaflet';

import { RouterLink } from '@angular/router';

import { TaskService } from '../../core/task.service';
import { UserService } from '../../core/user.service';
import { AttachmentService } from '../../core/attachment.service';
import {
  Attachment,
  CreateTaskRequest,
  FieldTask,
  FieldTaskStatus,
  Priority,
  UpdateTaskRequest,
  User,
} from '../../core/models';
import {
  AreaPolygon,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  areaCentroid,
  isValidArea,
  statusDivIcon,
} from '../../shared/leaflet-marker.util';
import { statusColor } from '../../shared/status.util';
import { DEFAULT_ICON, MARKER_ICON_GROUPS, resolveIcon } from '../../shared/marker-icons';
import { PRIORITY_OPTIONS } from '../../shared/priority.util';
import { MarkdownPipe } from '../../shared/markdown.pipe';
import { AuthImageComponent } from '../../shared/auth-image.component';
import { formatBytes } from '../../shared/file-size.util';
import { TranslationService } from '../../core/i18n/translation.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** A file selected on CREATE before the task exists, with a local preview URL. */
interface StagedFile {
  readonly id: string;
  readonly file: File;
  /** Object URL for image preview, or null for non-images. */
  readonly previewUrl: string | null;
  readonly isImage: boolean;
}

/** Inline markdown wrap actions for the description toolbar. */
type WrapKind = 'bold' | 'italic' | 'heading' | 'list' | 'link' | 'code';

/**
 * S5 Task Create / Edit — Jira-style two-column layout (arch §10.4, UX §4.4).
 *
 * One component for both create and edit, distinguished by the :id route param.
 *
 * MAIN column: title, a Markdown description editor (toolbar that wraps the
 * textarea selection + Edit/Preview toggle through the markdown pipe) and an
 * attachments area (drag-and-drop + picker, image thumbnails, file chips).
 * SIDEBAR: assignee dropdown, deadline, priority, an icon picker popover, and a
 * labels chip input — plus the Leaflet location picker (click/drag the marker).
 *
 * Attachment flow:
 *   - EDIT: the task already exists → files upload immediately to its id.
 *   - CREATE: files are staged client-side; on submit we create the task, upload
 *     the staged files to the new id, then navigate to it.
 */
@Component({
  selector: 'app-task-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    MarkdownPipe,
    AuthImageComponent,
    RouterLink,
    TranslatePipe,
  ],
  templateUrl: './task-form.component.html',
  styleUrl: './task-form.component.scss',
})
export class TaskFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);
  private readonly userService = inject(UserService);
  private readonly attachmentService = inject(AttachmentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);

  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('pickMap');
  private readonly descEl = viewChild<ElementRef<HTMLTextAreaElement>>('descArea');

  /** Edit when an :id param is present. */
  private readonly taskId = this.route.snapshot.paramMap.get('id');
  protected readonly isEdit = signal<boolean>(!!this.taskId);

  protected readonly workers = signal<User[]>([]);
  protected readonly loading = signal<boolean>(!!this.taskId);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  /* ---- Template enum / option exposure ---- */
  protected readonly Priority = Priority;
  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly iconGroups = MARKER_ICON_GROUPS;

  /* ---- Description editor state ---- */
  protected readonly previewMode = signal(false);

  /* ---- Icon picker ---- */
  protected readonly iconOpen = signal(false);
  protected readonly icon = signal<string>(DEFAULT_ICON);

  /* ---- Labels ---- */
  protected readonly labels = signal<string[]>([]);
  protected readonly labelDraft = signal('');

  /* ---- Attachments ---- */
  /** Existing attachments (edit mode, uploaded to the live task). */
  protected readonly existing = signal<Attachment[]>([]);
  /** Files staged client-side before the task exists (create mode). */
  protected readonly staged = signal<StagedFile[]>([]);
  protected readonly dragging = signal(false);
  protected readonly uploading = signal(false);
  protected readonly attachmentError = signal<string | null>(null);

  /** Captured location (null until the user clicks the map / loads on edit). */
  protected readonly lat = signal<number | null>(null);
  protected readonly lng = signal<number | null>(null);

  /** Original coords on edit, to detect a location change. */
  private originalLat: number | null = null;
  private originalLng: number | null = null;
  private loadedStatus: FieldTaskStatus = FieldTaskStatus.Created;

  protected readonly hasLocation = computed(() => this.lat() !== null && this.lng() !== null);
  protected readonly resolvedIcon = computed(() => resolveIcon(this.icon()));

  /* ---- Map mode + polygon area ---- */
  /** 'point' = click/drag a single marker; 'area' = each click appends a vertex. */
  protected readonly mapMode = signal<'point' | 'area'>('point');
  /** The polygon vertices as [lat, lng] pairs, bound to the form's `area`. */
  protected readonly areaPoints = signal<AreaPolygon>([]);
  /** True once the polygon has enough vertices to send (>= 3). */
  protected readonly hasArea = computed(() => isValidArea(this.areaPoints()));

  /* ---- Geolocation ("Current location" button) ---- */
  protected readonly locating = signal(false);
  protected readonly geoError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, this.notBlank]],
    description: [''],
    assigneeId: ['', Validators.required],
    deadline: ['', Validators.required],
    priority: [Priority.Low],
  });

  /* ---- Leaflet ---- */
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  /** Live polygon outline drawn while building an area. */
  private polygon: L.Polygon | null = null;
  /** Small draggable-looking dots marking each polygon vertex. */
  private vertexLayer: L.LayerGroup | null = null;

  constructor() {
    this.userService
      .listWorkers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (w) => this.workers.set(w) });

    if (this.taskId) {
      this.loadForEdit(this.taskId);
    }

    // Initialize the map once its container exists. In EDIT mode the #pickMap
    // container sits behind a loading gate, so a one-shot afterNextRender (which
    // runs before the task finishes loading) would miss it and the map would
    // never appear. This effect re-fires when #pickMap enters the view; initMap()
    // is idempotent (bails once the map exists).
    effect(() => {
      if (this.mapEl() && !this.map) {
        this.initMap();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.vertexLayer?.clearLayers();
      this.vertexLayer = null;
      this.polygon = null;
      this.marker = null;
      this.map?.remove();
      this.map = null;
      // Release any staged preview object URLs.
      for (const s of this.staged()) {
        if (s.previewUrl) {
          URL.revokeObjectURL(s.previewUrl);
        }
      }
    });
  }

  /** Localized label for a priority option in the select. */
  protected priorityOptionLabel(priority: Priority): string {
    return this.i18n.priorityLabel(priority);
  }

  /* ---- Validators ---- */
  private notBlank(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string;
    return value && value.trim().length > 0 ? null : { blank: true };
  }

  protected invalid(name: 'title' | 'assigneeId' | 'deadline'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  /* ---- Edit prefill ---- */
  private loadForEdit(id: string): void {
    this.taskService
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (t) => {
          this.loading.set(false);
          this.loadedStatus = t.status;
          this.icon.set(t.icon);
          this.labels.set([...t.labels]);
          this.form.patchValue({
            title: t.title,
            description: t.description ?? '',
            assigneeId: t.assigneeId,
            deadline: this.toLocalInput(t.deadline),
            priority: t.priority,
          });
          this.lat.set(t.latitude);
          this.lng.set(t.longitude);
          this.originalLat = t.latitude;
          this.originalLng = t.longitude;
          // Prefill the polygon from the saved area (if any).
          if (isValidArea(t.area)) {
            this.areaPoints.set(t.area.map((p) => [p[0], p[1]] as [number, number]));
          }
          this.placeMarker(t.latitude, t.longitude);
          this.renderPolygon();
          this.map?.setView([t.latitude, t.longitude], 15);
          this.loadAttachments(id);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(
            this.i18n.t(err.status === 404 ? 'form.errorNotAvailable' : 'form.errorLoadFailed'),
          );
        },
      });
  }

  private loadAttachments(id: string): void {
    this.attachmentService
      .list(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (a) => this.existing.set(a) });
  }

  /* ---- Description markdown editor ---- */

  protected setPreview(on: boolean): void {
    this.previewMode.set(on);
  }

  protected get descriptionValue(): string {
    return this.form.controls.description.value;
  }

  /** Wrap / transform the current textarea selection for a toolbar action. */
  protected applyWrap(kind: WrapKind): void {
    const el = this.descEl()?.nativeElement;
    if (!el) {
      return;
    }
    const value = el.value;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    let replacement: string;
    let caretStart: number;
    let caretEnd: number;

    switch (kind) {
      case 'bold': {
        const body = selected || 'bold text';
        replacement = `**${body}**`;
        caretStart = start + 2;
        caretEnd = caretStart + body.length;
        break;
      }
      case 'italic': {
        const body = selected || 'italic text';
        replacement = `*${body}*`;
        caretStart = start + 1;
        caretEnd = caretStart + body.length;
        break;
      }
      case 'code': {
        if (selected.includes('\n')) {
          const body = selected || 'code';
          replacement = `\`\`\`\n${body}\n\`\`\``;
          caretStart = start + 4;
          caretEnd = caretStart + body.length;
        } else {
          const body = selected || 'code';
          replacement = `\`${body}\``;
          caretStart = start + 1;
          caretEnd = caretStart + body.length;
        }
        break;
      }
      case 'heading': {
        const body = selected || 'Heading';
        const prefix = this.atLineStart(value, start) ? '## ' : '\n## ';
        replacement = `${prefix}${body}`;
        caretStart = start + prefix.length;
        caretEnd = caretStart + body.length;
        break;
      }
      case 'list': {
        const body = selected || 'List item';
        const lines = body
          .split('\n')
          .map((l) => `- ${l}`)
          .join('\n');
        const prefix = this.atLineStart(value, start) ? '' : '\n';
        replacement = `${prefix}${lines}`;
        caretStart = start + prefix.length + 2;
        caretEnd = start + prefix.length + lines.length;
        break;
      }
      case 'link': {
        const body = selected || 'link text';
        replacement = `[${body}](https://)`;
        // Place caret on the URL so the user can type it immediately.
        caretStart = start + body.length + 3;
        caretEnd = caretStart + 8;
        break;
      }
    }

    const next = value.slice(0, start) + replacement + value.slice(end);
    this.form.controls.description.setValue(next);
    this.form.controls.description.markAsDirty();
    // Restore focus + selection after Angular flushes the new value.
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(caretStart, caretEnd);
    });
  }

  private atLineStart(value: string, index: number): boolean {
    return index === 0 || value[index - 1] === '\n';
  }

  /* ---- Icon picker ---- */

  protected toggleIconPicker(): void {
    this.iconOpen.update((v) => !v);
  }

  protected chooseIcon(glyph: string): void {
    this.icon.set(glyph);
    this.iconOpen.set(false);
    if (this.marker) {
      this.placeMarker(this.lat()!, this.lng()!);
    }
  }

  /* ---- Labels ---- */

  protected onLabelInput(value: string): void {
    this.labelDraft.set(value);
  }

  protected commitLabel(): void {
    const raw = this.labelDraft().trim();
    if (!raw) {
      return;
    }
    const exists = this.labels().some((l) => l.toLowerCase() === raw.toLowerCase());
    if (!exists) {
      this.labels.update((list) => [...list, raw]);
    }
    this.labelDraft.set('');
  }

  protected removeLabel(label: string): void {
    this.labels.update((list) => list.filter((l) => l !== label));
  }

  /** Backspace on an empty draft removes the last chip (Jira-style). */
  protected onLabelBackspace(): void {
    if (this.labelDraft() === '' && this.labels().length > 0) {
      this.labels.update((list) => list.slice(0, -1));
    }
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
      this.addFiles(files);
    }
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      this.addFiles(input.files);
    }
    // Reset so picking the same file again still fires change.
    input.value = '';
  }

  private addFiles(fileList: FileList): void {
    this.attachmentError.set(null);
    const files = Array.from(fileList);
    if (this.isEdit() && this.taskId) {
      this.uploadNow(this.taskId, files);
    } else {
      const newStaged = files.map<StagedFile>((file) => {
        const isImage = file.type.startsWith('image/');
        return {
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          file,
          isImage,
          previewUrl: isImage ? URL.createObjectURL(file) : null,
        };
      });
      this.staged.update((list) => [...list, ...newStaged]);
    }
  }

  /** EDIT mode: upload files immediately to the live task. */
  private uploadNow(taskId: string, files: File[]): void {
    this.uploading.set(true);
    concat(...files.map((f) => this.attachmentService.upload(taskId, f)))
      .pipe(toArray(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.uploading.set(false);
          this.existing.update((list) => [...list, ...created]);
        },
        error: (err: HttpErrorResponse) => {
          this.uploading.set(false);
          this.attachmentError.set(this.uploadErrorMessage(err));
        },
      });
  }

  protected removeStaged(id: string): void {
    const target = this.staged().find((s) => s.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    this.staged.update((list) => list.filter((s) => s.id !== id));
  }

  protected deleteExisting(att: Attachment): void {
    if (!this.taskId) {
      return;
    }
    this.attachmentError.set(null);
    this.attachmentService
      .delete(this.taskId, att.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.existing.update((list) => list.filter((a) => a.id !== att.id)),
        error: () => this.attachmentError.set(this.i18n.t('attachment.errorRemoveFailed')),
      });
  }

  protected formatSize(bytes: number): string {
    return formatBytes(bytes);
  }

  private uploadErrorMessage(err: HttpErrorResponse): string {
    if (err.status === 413 || err.status === 400) {
      return this.i18n.t('attachment.errorTooLarge');
    }
    if (err.status === 403) {
      return this.i18n.t('attachment.errorForbidden');
    }
    return this.i18n.t('attachment.errorUploadFailed');
  }

  /* ---- Submit ---- */
  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.hasLocation()) {
      this.error.set(this.i18n.t('form.errorLocationRequired'));
      return;
    }

    const raw = this.form.getRawValue();
    const deadlineUtc = this.toUtcIso(raw.deadline);
    const description = raw.description.trim() || null;
    const labels = this.labels();
    // Only send a valid polygon (>= 3 vertices); otherwise null clears any area.
    const area: number[][] | null = this.hasArea() ? this.areaPoints() : null;
    this.submitting.set(true);

    if (this.isEdit() && this.taskId) {
      this.saveEdit(this.taskId, {
        title: raw.title.trim(),
        description,
        icon: this.icon(),
        priority: raw.priority,
        labels,
        area,
        assigneeId: raw.assigneeId,
        deadline: deadlineUtc,
      });
    } else {
      const dto: CreateTaskRequest = {
        title: raw.title.trim(),
        description,
        icon: this.icon(),
        priority: raw.priority,
        labels,
        area,
        assigneeId: raw.assigneeId,
        deadline: deadlineUtc,
        latitude: this.lat()!,
        longitude: this.lng()!,
      };
      this.taskService.create(dto).subscribe({
        next: (t) => this.afterCreate(t),
        error: (err: HttpErrorResponse) => this.onError(err),
      });
    }
  }

  private saveEdit(id: string, fields: UpdateTaskRequest): void {
    const coordsChanged = this.lat() !== this.originalLat || this.lng() !== this.originalLng;

    const update$ = this.taskService.update(id, fields);
    const location$ = coordsChanged
      ? this.taskService.setLocation(id, this.lat()!, this.lng()!)
      : of(null);

    forkJoin([update$, location$]).subscribe({
      next: () => this.onSaved(id),
      error: (err: HttpErrorResponse) => this.onError(err),
    });
  }

  /**
   * CREATE: the task now exists → upload the staged files to its id, then
   * navigate. A staged-upload failure is non-fatal: the task was created, so we
   * still navigate to it (the user can re-add the file there).
   */
  private afterCreate(task: FieldTask): void {
    const files = this.staged().map((s) => s.file);
    if (files.length === 0) {
      this.onSaved(task.id);
      return;
    }
    concat(...files.map((f) => this.attachmentService.upload(task.id, f)))
      .pipe(toArray())
      .subscribe({
        next: () => this.onSaved(task.id),
        error: () => this.onSaved(task.id),
      });
  }

  private onSaved(id: string): void {
    this.submitting.set(false);
    void this.router.navigate(['/tasks', id]);
  }

  private onError(err: HttpErrorResponse): void {
    this.submitting.set(false);
    if (err.status === 400) {
      // Prefer the server's human-readable detail; otherwise a localized fallback.
      this.error.set(err.error?.detail ?? this.i18n.t('form.errorCheckFields'));
    } else if (err.status === 403) {
      this.error.set(this.i18n.t('form.errorForbidden'));
    } else if (err.status === 404) {
      this.error.set(this.i18n.t('form.errorNotAvailable'));
    } else {
      this.error.set(this.i18n.t('form.errorSaveFailed'));
    }
  }

  protected cancel(): void {
    if (this.isEdit() && this.taskId) {
      void this.router.navigate(['/tasks', this.taskId]);
    } else {
      void this.router.navigate(['/dashboard']);
    }
  }

  /* ---- Leaflet pick map ---- */
  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map) {
      return;
    }
    const center: L.LatLngExpression =
      this.lat() !== null && this.lng() !== null ? [this.lat()!, this.lng()!] : DEFAULT_CENTER;
    const zoom = this.lat() !== null ? 15 : DEFAULT_ZOOM;

    this.map = L.map(el, { center, zoom });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.vertexLayer = L.layerGroup().addTo(this.map);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.mapMode() === 'area') {
        this.appendVertex(e.latlng.lat, e.latlng.lng);
      } else {
        this.setCoords(e.latlng.lat, e.latlng.lng);
      }
    });

    if (this.lat() !== null && this.lng() !== null) {
      this.placeMarker(this.lat()!, this.lng()!);
    }
    // Re-draw any polygon that was prefilled before the map existed (edit mode).
    this.renderPolygon();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private setCoords(lat: number, lng: number): void {
    this.lat.set(lat);
    this.lng.set(lng);
    this.placeMarker(lat, lng);
  }

  /* ---- Map mode toggle ---- */

  protected setMapMode(mode: 'point' | 'area'): void {
    this.mapMode.set(mode);
  }

  /** "Done" — leave draw mode back to point editing. */
  protected finishArea(): void {
    this.mapMode.set('point');
  }

  /* ---- Polygon area drawing ---- */

  /** Append a vertex (area mode), redraw, and re-anchor the point to the centroid. */
  private appendVertex(lat: number, lng: number): void {
    this.areaPoints.update((pts) => [...pts, [lat, lng]]);
    this.afterAreaChange();
  }

  /** Remove the last vertex (toolbar "Undo"). */
  protected undoVertex(): void {
    if (this.areaPoints().length === 0) {
      return;
    }
    this.areaPoints.update((pts) => pts.slice(0, -1));
    this.afterAreaChange();
  }

  /** Drop the whole polygon (toolbar "Clear area"). Keeps the point marker. */
  protected clearArea(): void {
    this.areaPoints.set([]);
    this.afterAreaChange();
  }

  /**
   * After any area change: redraw the polygon + vertex dots and, once the
   * polygon is valid (>= 3 vertices), move the task point to its centroid so the
   * marker sits inside the area (the user can still drag it afterwards).
   */
  private afterAreaChange(): void {
    this.renderPolygon();
    const centroid = areaCentroid(this.areaPoints());
    if (centroid) {
      this.setCoords(centroid[0], centroid[1]);
    }
  }

  /** Rebuild the live polygon outline and vertex dots from `areaPoints`. */
  private renderPolygon(): void {
    if (!this.map || !this.vertexLayer) {
      return;
    }
    const pts = this.areaPoints();
    const color = statusColor(this.loadedStatus);

    // Remove an existing outline before redrawing.
    if (this.polygon) {
      this.map.removeLayer(this.polygon);
      this.polygon = null;
    }
    this.vertexLayer.clearLayers();

    if (pts.length === 0) {
      return;
    }

    if (pts.length >= 2) {
      this.polygon = L.polygon(pts as L.LatLngExpression[], {
        color,
        weight: 2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.15,
        interactive: false,
      }).addTo(this.map);
    }

    // Small vertex dots so each click point reads clearly.
    for (const [vLat, vLng] of pts) {
      L.circleMarker([vLat, vLng], {
        radius: 5,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
      }).addTo(this.vertexLayer);
    }
  }

  /* ---- Current location (geolocation) ---- */

  protected useCurrentLocation(): void {
    this.geoError.set(null);
    if (!('geolocation' in navigator)) {
      this.geoError.set(this.i18n.t('errors.geoUnavailable'));
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const { latitude, longitude } = pos.coords;
        this.setCoords(latitude, longitude);
        this.map?.setView([latitude, longitude], 16);
      },
      (err) => {
        this.locating.set(false);
        this.geoError.set(
          this.i18n.t(err.code === err.PERMISSION_DENIED ? 'errors.geoDenied' : 'errors.geoFailed'),
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  /** Create/move the draggable marker (FR-11), reflecting the chosen icon. */
  private placeMarker(lat: number, lng: number): void {
    if (!this.map) {
      return;
    }
    const pos: L.LatLngExpression = [lat, lng];
    const icon = statusDivIcon(this.loadedStatus, { draggable: true, icon: this.icon() });
    if (this.marker) {
      this.marker.setLatLng(pos).setIcon(icon);
    } else {
      this.marker = L.marker(pos, { icon, draggable: true }).addTo(this.map);
      this.marker.on('dragend', () => {
        const p = this.marker!.getLatLng();
        this.lat.set(p.lat);
        this.lng.set(p.lng);
      });
    }
  }

  /* ---- Date conversion (UTC stored, local edited) ---- */

  /** ISO/UTC string → value for a <input type="datetime-local"> (local tz). */
  private toLocalInput(utc: string): string {
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  /** datetime-local value (local tz) → UTC ISO string for the API. */
  private toUtcIso(local: string): string {
    return new Date(local).toISOString();
  }
}
