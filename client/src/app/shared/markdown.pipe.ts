import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Render trusted-after-sanitizing Markdown to SafeHtml.
 *
 * Pipeline: marked.parse (GFM) -> DOMPurify.sanitize -> bypassSecurityTrustHtml.
 * DOMPurify strips scripts/handlers so the bypass is safe; we never trust raw
 * user Markdown directly. Pure pipe — recomputes only when the input string
 * changes. Returns '' for null/empty input.
 *
 * Usage:  <div [innerHTML]="task.description | markdown"></div>
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (value === null || value === undefined || value.trim() === '') {
      return '';
    }
    // async:false guarantees a synchronous string (no Promise) from marked v18.
    const rawHtml = marked.parse(value, { async: false }) as string;
    const clean = DOMPurify.sanitize(rawHtml);
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
