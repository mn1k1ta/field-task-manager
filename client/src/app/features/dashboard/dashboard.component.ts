import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import * as L from 'leaflet';

import { TaskService } from '../../core/task.service';
import { UserService } from '../../core/user.service';
import { AuthService } from '../../core/auth.service';
import { FieldTask, FieldTaskStatus, TaskQuery, User } from '../../core/models';
import { STATUS_META } from '../../shared/status.util';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import {
  AreaPolygon,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  isValidArea,
  statusAreaPolygon,
  statusDivIcon,
} from '../../shared/leaflet-marker.util';
import { statusColor } from '../../shared/status.util';
import { resolveIcon } from '../../shared/marker-icons';
import { priorityColor } from '../../shared/priority.util';
import { TranslationService } from '../../core/i18n/translation.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * S3 Dashboard (arch §10.4, UX §4.2) — the MAIN screen.
 *
 * Layout: a Leaflet map filling the main area on the left, and a task-list pane
 * on the right with a filter bar (debounced search, status select, Admin-only
 * assignee filter + "New Task" button). The server returns the role-scoped set
 * (FR-7), so Workers automatically see only their own tasks.
 *
 * Filters are signals; their combined value drives a debounced reload via
 * TaskService.list(query). Markers are status-colored divIcons; clicking a
 * marker or list row navigates to /tasks/:id.
 *
 * Leaflet lifecycle: the map is created with afterNextRender (the container
 * exists), invalidateSize is called after layout, markers are re-synced
 * whenever the task list changes, and map.remove() runs on destroy.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, StatusBadgeComponent, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly taskService = inject(TaskService);
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly i18n = inject(TranslationService);

  /** Active UI language — bound to DatePipe locale so dates localize live. */
  protected readonly lang = this.i18n.current;

  /** Map container element (set once the view renders). */
  private readonly mapEl = viewChild<ElementRef<HTMLElement>>('mapContainer');

  /** Enum + metadata for the template. */
  protected readonly FieldTaskStatus = FieldTaskStatus;
  protected readonly statusOptions = STATUS_META;
  protected readonly isAdmin = this.auth.isAdmin;

  /* ---- Filter state (signals) ---- */
  protected readonly search = signal('');
  protected readonly statusFilter = signal<FieldTaskStatus | null>(null);
  protected readonly assigneeFilter = signal<string | null>(null);

  /* ---- Data state ---- */
  protected readonly tasks = signal<FieldTask[]>([]);
  protected readonly workers = signal<User[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);

  /** Combined query, recomputed whenever any filter changes. */
  private readonly query = computed<TaskQuery>(() => {
    const q: TaskQuery = {};
    const s = this.search().trim();
    if (s) {
      q.search = s;
    }
    if (this.statusFilter() !== null) {
      q.status = this.statusFilter()!;
    }
    if (this.assigneeFilter()) {
      q.assigneeId = this.assigneeFilter()!;
    }
    return q;
  });

  /** True when filters are active but no rows matched (vs. empty system). */
  protected readonly hasActiveFilter = computed(
    () => !!this.search().trim() || this.statusFilter() !== null || !!this.assigneeFilter(),
  );

  /* ---- Leaflet ---- */
  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;
  /** Translucent status-colored area polygons, drawn beneath the markers. */
  private areaLayer: L.LayerGroup | null = null;
  private readonly markersById = new Map<string, L.Marker>();

  /** Translucent status-colored halo shown around the hovered marker. */
  private hoverAura: L.Circle | null = null;
  /** Id of the currently hovered task (marker or list row), if any. */
  private hoveredId: string | null = null;
  /** Map view (center+zoom) before hovering began, restored when hover ends. */
  private baseView: { center: L.LatLng; zoom: number } | null = null;
  /** Debounce so moving between markers doesn't restore-then-rezoom (flicker). */
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  /** Fit-to-all is auto-run only on the first non-empty render; filter
   *  reloads after that must not move the view (the user pans/zooms freely). */
  private didInitialFit = false;

  constructor() {
    // Admin-only: populate the assignee filter dropdown.
    if (this.auth.isAdmin()) {
      this.userService
        .listWorkers()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (w) => this.workers.set(w) });
    }

    // Debounced reactive reload: query signal -> observable -> list call.
    toObservable(this.query)
      .pipe(
        debounceTime(250),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        switchMap((q) => {
          this.loading.set(true);
          this.error.set(null);
          return this.taskService.list(q);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (list) => {
          this.loading.set(false);
          this.tasks.set(list);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('dashboard.errorLoad');
        },
      });

    // Re-sync markers whenever the task list changes (after the map exists).
    effect(() => {
      const list = this.tasks();
      if (this.map) {
        this.renderMarkers(list);
      }
    });

    // Create the map once the DOM container is present.
    afterNextRender(() => this.initMap());

    this.destroyRef.onDestroy(() => {
      if (this.restoreTimer) {
        clearTimeout(this.restoreTimer);
      }
      this.clearAura();
      this.areaLayer?.clearLayers();
      this.areaLayer = null;
      this.markerLayer?.clearLayers();
      this.markerLayer = null;
      this.map?.remove();
      this.map = null;
    });
  }

  /* ---- Filter handlers ---- */

  protected onSearchInput(value: string): void {
    this.search.set(value);
  }

  protected onStatusChange(value: string): void {
    this.statusFilter.set(value === '' ? null : (Number(value) as FieldTaskStatus));
  }

  protected onAssigneeChange(value: string): void {
    this.assigneeFilter.set(value === '' ? null : value);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set(null);
    this.assigneeFilter.set(null);
  }

  /* ---- Navigation ---- */

  protected openTask(id: string): void {
    void this.router.navigate(['/tasks', id]);
  }

  /**
   * Shared hover entry point for list rows AND markers. Passing an id
   * highlights that marker (and pans/auras/tooltips to it); passing null
   * reverts everything. Keeps selection-highlight state in sync too.
   */
  protected hoverTask(id: string | null): void {
    this.selectedId.set(id);
    if (id) {
      this.enterHover(id);
    } else {
      this.leaveHover();
    }
  }

  protected isOverdue(task: FieldTask): boolean {
    return (
      task.status !== FieldTaskStatus.Verified && new Date(task.deadline).getTime() < Date.now()
    );
  }

  /** Resolved marker glyph for a list row (mirrors the map marker). */
  protected rowIcon(task: FieldTask): string {
    return resolveIcon(task.icon);
  }

  /** Priority color for the small list-row dot. */
  protected rowPriorityColor(task: FieldTask): string {
    return priorityColor(task.priority);
  }

  /** Accessible priority label for the list-row dot (localized). */
  protected rowPriorityLabel(task: FieldTask): string {
    return this.i18n.priorityLabel(task.priority);
  }

  /** Localized status label for the filter dropdown options. */
  protected statusOptionLabel(status: FieldTaskStatus): string {
    return this.i18n.statusLabel(status);
  }

  /* ---- Leaflet lifecycle ---- */

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map) {
      return;
    }
    this.map = L.map(el, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    // Areas sit beneath markers (added first) so the pin stays clickable.
    this.areaLayer = L.layerGroup().addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);

    // Container may have just sized; force a relayout, then draw markers.
    setTimeout(() => {
      this.map?.invalidateSize();
      this.renderMarkers(this.tasks());
    }, 0);
  }

  /** Rebuild markers from the current task list. */
  private renderMarkers(tasks: FieldTask[]): void {
    if (!this.map || !this.markerLayer || !this.areaLayer) {
      return;
    }
    // A reload rebuilds the marker elements, so any prior hover/faded/aura
    // state on the old DOM nodes is gone — reset our trackers to match.
    this.clearAura();
    this.hoveredId = null;
    this.markerLayer.clearLayers();
    // Drop the previous polygons too (cleared on every reload — no leaks).
    this.areaLayer.clearLayers();
    this.markersById.clear();

    for (const task of tasks) {
      // Draw the task's area polygon (if any) beneath its marker.
      if (isValidArea(task.area)) {
        statusAreaPolygon(task.area as AreaPolygon, task.status).addTo(this.areaLayer);
      }
      const marker = L.marker([task.latitude, task.longitude], {
        icon: statusDivIcon(task.status, { icon: task.icon }),
        title: task.title,
        riseOnHover: true,
      });
      marker.bindPopup(this.popupHtml(task));
      marker.bindTooltip(this.tooltipHtml(task), {
        className: 'task-tip',
        direction: 'top',
        offset: [0, -16],
        opacity: 1,
      });
      marker.on('click', () => this.openTask(task.id));
      // Hover a marker -> highlight ONLY it (same path as list-row hover).
      marker.on('mouseover', () => this.hoverTask(task.id));
      marker.on('mouseout', () => this.hoverTask(null));
      marker.addTo(this.markerLayer!);
      this.markersById.set(task.id, marker);
    }

    // Auto-fit only on the very first non-empty render; later filter reloads
    // must leave the user's pan/zoom untouched (spec §4).
    if (!this.didInitialFit && tasks.length > 0) {
      this.fitToMarkers(tasks);
      this.didInitialFit = true;
    }
  }

  /** Fit bounds to the visible markers, or fall back to the default view. */
  private fitToMarkers(tasks: FieldTask[]): void {
    if (!this.map) {
      return;
    }
    if (tasks.length === 0) {
      this.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    const bounds = L.latLngBounds(tasks.map((t) => [t.latitude, t.longitude] as L.LatLngTuple));
    this.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }

  /** Recenter to "fit all" markers (the map control) — always on demand. */
  protected fitAll(): void {
    this.fitToMarkers(this.tasks());
  }

  /* ---- Hover highlight (shared by markers + list rows, spec §2–§6) ---- */

  /**
   * Highlight a single marker: mark it `is-hover`, dim every other marker
   * (`is-faded`), raise it to front, pan to it (keep zoom), draw a status
   * halo, and open its tooltip. Reverts the previous hover first.
   */
  private enterHover(id: string): void {
    if (!this.map) {
      return;
    }
    if (this.hoveredId === id) {
      return;
    }
    this.leaveHover();

    const target = this.markersById.get(id);
    if (!target) {
      return;
    }
    this.hoveredId = id;

    for (const [markerId, marker] of this.markersById) {
      const el = marker.getElement();
      if (!el) {
        continue;
      }
      if (markerId === id) {
        el.classList.add('is-hover');
        el.classList.remove('is-faded');
      } else {
        el.classList.add('is-faded');
        el.classList.remove('is-hover');
      }
    }

    target.setZIndexOffset(1000);
    target.openTooltip();

    // Cancel a pending zoom-back and remember the overview to return to later.
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
    if (!this.baseView) {
      this.baseView = { center: this.map.getCenter(), zoom: this.map.getZoom() };
    }

    const latlng = target.getLatLng();
    const task = untracked(this.tasks).find((t) => t.id === id);
    this.zoomToTask(task, latlng);
  }

  /** Revert all hover state: un-fade, drop the halo, close tooltips, reset z. */
  private leaveHover(): void {
    if (this.hoveredId === null) {
      return;
    }
    const prev = this.markersById.get(this.hoveredId);
    prev?.closeTooltip();
    prev?.setZIndexOffset(0);

    for (const marker of this.markersById.values()) {
      const el = marker.getElement();
      el?.classList.remove('is-hover', 'is-faded');
    }
    this.clearAura();
    this.hoveredId = null;

    // Debounced zoom-back: when hovering truly ends (no new marker within a
    // moment), fly back to the overview. enterHover cancels this on a new hover,
    // so scanning across markers doesn't restore-then-rezoom (flicker).
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
    }
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      if (this.hoveredId === null && this.baseView && this.map) {
        this.map.flyTo(this.baseView.center, this.baseView.zoom, { duration: 0.5 });
      }
      this.baseView = null;
    }, 350);
  }

  /**
   * Zoom the map toward the hovered task so it's clearly visible up close:
   * tasks WITH a polygon area are fit so the area fills ~50% of the map
   * (25% padding each side); point-only tasks zoom in close so the marker is
   * prominent. Smooth fly animation; the overview is restored on hover-out.
   */
  private zoomToTask(task: FieldTask | undefined, latlng: L.LatLng): void {
    if (!this.map) {
      return;
    }
    const area = task?.area;
    if (area && isValidArea(area)) {
      const bounds = L.latLngBounds(area.map((p) => [p[0], p[1]] as L.LatLngTuple));
      const size = this.map.getSize();
      const padX = Math.round(size.x * 0.25);
      const padY = Math.round(size.y * 0.25);
      this.map.flyToBounds(bounds, {
        paddingTopLeft: [padX, padY],
        paddingBottomRight: [padX, padY],
        maxZoom: 18,
        duration: 0.5,
      });
      // The rendered area polygon already highlights it; no circular halo.
      this.clearAura();
    } else {
      // A point has no size, so "50% of the map" -> a close, prominent zoom.
      const targetZoom = Math.min(18, Math.max(this.map.getZoom(), 17));
      this.map.flyTo(latlng, targetZoom, { duration: 0.5 });
      this.drawAura(latlng, task?.status, targetZoom);
    }
  }

  /** Draw the translucent status-colored halo around the hovered marker. */
  private drawAura(latlng: L.LatLng, status: FieldTaskStatus | undefined, zoom?: number): void {
    if (!this.map) {
      return;
    }
    this.clearAura();
    const z = zoom ?? this.map.getZoom();
    const color = status === undefined ? '#2f6df6' : statusColor(status);
    // Scale the radius to the (target) zoom so it reads as a small ring, not a
    // giant circle, once we've zoomed in on hover.
    const radius = 120 * Math.pow(2, 14 - z);
    this.hoverAura = L.circle(latlng, {
      radius: Math.max(40, radius),
      color,
      weight: 1.5,
      opacity: 0.7,
      dashArray: '4 4',
      fillColor: color,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(this.map);
  }

  /** Remove the halo layer if present (no leaks). */
  private clearAura(): void {
    if (this.hoverAura && this.map) {
      this.map.removeLayer(this.hoverAura);
    }
    this.hoverAura = null;
  }

  private popupHtml(task: FieldTask): string {
    const title = this.escape(task.title);
    const label = this.escape(this.i18n.statusLabel(task.status));
    return `<strong>${title}</strong><br><span>${label}</span>`;
  }

  /** Pretty hover-label markup: task title + localized status, both escaped. */
  private tooltipHtml(task: FieldTask): string {
    const title = this.escape(task.title);
    const label = this.escape(this.i18n.statusLabel(task.status));
    return `<span class="task-tip__title">${title}</span><span class="task-tip__status">${label}</span>`;
  }

  private escape(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
  }
}
