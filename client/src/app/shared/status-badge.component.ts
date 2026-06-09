import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FieldTaskStatus } from '../core/models';
import { statusMeta } from './status.util';
import { TranslationService } from '../core/i18n/translation.service';

/**
 * Status badge pill (UX §5.5): colored dot + label + icon.
 *
 * Color/icon come from the single status.util source (so the badge never drifts
 * from markers/legend); the human label is resolved through TranslationService
 * (keys `status.*`) so it follows the active language.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="status-badge"
      [style.background-color]="meta().bg"
      [style.color]="meta().text"
      [attr.aria-label]="i18n.t('status.statusOfAria', { label: label() })"
    >
      <span class="status-dot" [style.background-color]="meta().color" aria-hidden="true"></span>
      <span aria-hidden="true">{{ meta().icon }}</span>
      <span>{{ label() }}</span>
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<FieldTaskStatus>();
  protected readonly i18n = inject(TranslationService);
  protected readonly meta = computed(() => statusMeta(this.status()));
  protected readonly label = computed(() => this.i18n.statusLabel(this.status()));
}
