import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/**
 * Translate a dotted i18n key in templates: `{{ 'auth.signIn' | t }}` or with
 * params `{{ 'detail.attachments' | t: { count: n } }}`.
 *
 * Deliberately IMPURE (`pure: false`) so it re-evaluates on every change
 * detection pass — that lets bound strings flip the instant the active language
 * changes, without each call site having to subscribe to the language signal.
 */
@Pipe({
  name: 't',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
