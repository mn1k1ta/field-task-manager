import { Injectable, signal } from '@angular/core';
import { FieldTaskStatus, Priority } from '../models';
import { EN } from './en';
import { UK } from './uk';

/** Supported UI languages. Ukrainian is the default. */
export type Lang = 'uk' | 'en';

/** A flat dotted-key dictionary (e.g. `auth.signIn`). */
export type Dictionary = Record<string, string>;

const STORAGE_KEY = 'ftm.lang';
const DEFAULT_LANG: Lang = 'uk';

const DICT: Record<Lang, Dictionary> = {
  uk: UK,
  en: EN,
};

/**
 * Lightweight runtime i18n (NOT @angular/localize).
 *
 * Holds the active language as a signal so any consumer (the impure `t` pipe,
 * computed labels, components) re-renders when the language changes. Strings are
 * looked up by dotted key in the active language, falling back to English and
 * then to the key itself, with `{{name}}` placeholder interpolation.
 *
 * The choice is persisted to localStorage under `ftm.lang` and mirrored onto
 * `<html lang>` so DatePipe / assistive tech pick up the right locale.
 */
@Injectable({ providedIn: 'root' })
export class TranslationService {
  /** Active language signal (private writable). */
  private readonly lang = signal<Lang>(this.initialLang());

  /** Readonly current language for consumers (DatePipe locale arg, toggles). */
  readonly current = this.lang.asReadonly();

  constructor() {
    this.applyDocumentLang(this.lang());
  }

  /** Switch language: persist, update the signal, and reflect on <html lang>. */
  setLang(lang: Lang): void {
    if (lang === this.lang()) {
      return;
    }
    this.lang.set(lang);
    this.applyDocumentLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage may be unavailable (private mode) — ignore */
    }
  }

  /**
   * Translate a dotted key for the active language.
   *
   * Lookup order: active language → English → the key itself. `{{placeholder}}`
   * tokens are replaced from `params` (missing params are left as the raw
   * token so gaps are visible rather than silently blank).
   */
  t(key: string, params?: Record<string, string | number>): string {
    const lang = this.lang();
    const template = DICT[lang][key] ?? DICT.en[key] ?? key;
    if (!params) {
      return template;
    }
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
    );
  }

  /** Localized label for a task status (keys `status.0`..`status.3`). */
  statusLabel(status: FieldTaskStatus): string {
    return this.t(`status.${status}`);
  }

  /** Localized label for a task priority (keys `priority.0`..`priority.3`). */
  priorityLabel(priority: Priority): string {
    return this.t(`priority.${priority}`);
  }

  /** Initial language: persisted choice, else the default (Ukrainian). */
  private initialLang(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'uk' || saved === 'en') {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_LANG;
  }

  private applyDocumentLang(lang: Lang): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }
}
