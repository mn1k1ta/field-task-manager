import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { STATUS_LEGEND } from './status.util';
import { TranslationService } from '../core/i18n/translation.service';

/**
 * Renders the four status colors + labels + icons (arch §10.6, UX §5.2).
 *
 * Color/icon come from the single status.util source; labels are localized via
 * TranslationService (keys `status.*`). Color is always paired with a label and
 * an icon (never color alone — accessibility floor, UX P3). Used in the shell's
 * Legend popover.
 */
@Component({
  selector: 'app-status-legend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="legend" [attr.aria-label]="i18n.t('status.legendAria')">
      @for (item of legend; track item.status) {
        <li class="legend-row">
          <span class="legend-dot" [style.background-color]="item.color" aria-hidden="true"></span>
          <span class="legend-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="legend-label">{{ i18n.statusLabel(item.status) }}</span>
        </li>
      }
    </ul>
  `,
  styles: [
    `
      .legend {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .legend-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: 13px;
        color: var(--color-text);
      }
      .legend-dot {
        width: 12px;
        height: 12px;
        border-radius: var(--radius-full);
        border: 1px solid rgba(255, 255, 255, 0.85);
        box-shadow: 0 0 0 1px var(--color-border);
        flex: 0 0 auto;
      }
      .legend-icon {
        width: 14px;
        text-align: center;
        color: var(--color-text-muted);
      }
      .legend-label {
        font-weight: 500;
      }
    `,
  ],
})
export class StatusLegendComponent {
  protected readonly i18n = inject(TranslationService);
  readonly legend = STATUS_LEGEND;
}
