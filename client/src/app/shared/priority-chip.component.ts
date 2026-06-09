import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Priority } from '../core/models';
import { priorityMeta } from './priority.util';
import { TranslationService } from '../core/i18n/translation.service';

/**
 * Priority chip (Jira-style): a small colored flag glyph + label.
 *
 * Color comes from the single priority.util source so the chip, the form
 * select, and any sort/filter UI can never drift. The label is resolved through
 * TranslationService (keys `priority.*`) so it follows the active language. The
 * flag glyph is a non-color reinforcement (accessibility floor — never color
 * alone).
 */
@Component({
  selector: 'app-priority-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="priority-chip"
      [style.--pc]="meta().color"
      [attr.aria-label]="i18n.t('priority.priorityOfAria', { label: label() })"
    >
      <span class="priority-chip__flag" aria-hidden="true">⚑</span>
      <span>{{ label() }}</span>
    </span>
  `,
  styles: [
    `
      .priority-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: var(--radius-full);
        font-size: 12px;
        font-weight: 600;
        line-height: 18px;
        color: var(--pc, var(--color-text-muted));
        background: color-mix(in srgb, var(--pc, #888) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--pc, #888) 30%, transparent);
      }
      .priority-chip__flag {
        font-size: 11px;
        line-height: 1;
      }
    `,
  ],
})
export class PriorityChipComponent {
  readonly priority = input.required<Priority>();
  protected readonly i18n = inject(TranslationService);
  protected readonly meta = computed(() => priorityMeta(this.priority()));
  protected readonly label = computed(() => this.i18n.priorityLabel(this.priority()));
}
