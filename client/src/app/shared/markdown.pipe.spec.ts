import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownPipe } from './markdown.pipe';

/**
 * MarkdownPipe — renders Markdown to SafeHtml AND sanitizes it (DOMPurify).
 *
 * The pipe returns a `SafeHtml` produced via bypassSecurityTrustHtml; to inspect
 * the underlying string we round-trip it back through DomSanitizer.sanitize with
 * SecurityContext.HTML (the same trusted value unwraps to its inner string).
 */
describe('MarkdownPipe', () => {
  let pipe: MarkdownPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    sanitizer = TestBed.inject(DomSanitizer);
    pipe = TestBed.runInInjectionContext(() => new MarkdownPipe());
  });

  /** Unwrap the SafeHtml the pipe produces into a raw HTML string. */
  function render(value: string | null | undefined): string {
    const safe: SafeHtml = pipe.transform(value);
    if (safe === '') {
      return '';
    }
    return sanitizer.sanitize(SecurityContext.HTML, safe) ?? '';
  }

  it('returns empty string for null / undefined / blank input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('   ')).toBe('');
  });

  it('renders basic markdown to HTML', () => {
    const html = render('# Title');
    expect(html).toContain('<h1');
    expect(html).toContain('Title');
  });

  it('renders bold and emphasis', () => {
    const html = render('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('strips a <script> tag (XSS defense)', () => {
    const html = render('hello <script>alert("xss")</script> world');
    expect(html).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('alert');
  });

  it('strips an onerror handler from an injected element', () => {
    const html = render('<img src="x" onerror="alert(1)">');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html.toLowerCase()).not.toContain('alert');
  });
});
