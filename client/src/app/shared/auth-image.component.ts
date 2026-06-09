import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AttachmentService } from '../core/attachment.service';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Renders an image whose URL requires the bearer token (attachment content),
 * so a plain <img src> would 401. Fetches the bytes via
 * AttachmentService.fetchBlobUrl, binds the resulting object URL to <img>, and
 * shows a loading shimmer / error placeholder. Reusable for thumbnails and
 * full-size previews.
 *
 * The object URL is revoked on destroy and whenever `src` changes, so we never
 * leak blobs as the user pages through attachments.
 *
 * Usage:  <app-auth-image [src]="attachment.url" [alt]="attachment.fileName" />
 */
@Component({
  selector: 'app-auth-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'loaded') {
      <img class="auth-image__img" [src]="objectUrl()" [alt]="alt()" />
    } @else if (state() === 'error') {
      <span class="auth-image__state auth-image__state--error" role="img" [attr.aria-label]="alt()">
        ⚠️
      </span>
    } @else {
      <span class="auth-image__state auth-image__state--loading" aria-hidden="true"></span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: var(--surface-2, #eef1f5);
      }
      .auth-image__img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .auth-image__state {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        min-width: 1.5rem;
        min-height: 1.5rem;
      }
      .auth-image__state--loading {
        background: linear-gradient(
          100deg,
          var(--surface-2, #eef1f5) 30%,
          var(--surface-3, #e2e7ee) 50%,
          var(--surface-2, #eef1f5) 70%
        );
        background-size: 200% 100%;
        animation: auth-image-shimmer 1.2s ease-in-out infinite;
      }
      .auth-image__state--error {
        font-size: 1.1rem;
        opacity: 0.7;
      }
      @keyframes auth-image-shimmer {
        from {
          background-position: 200% 0;
        }
        to {
          background-position: -200% 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .auth-image__state--loading {
          animation: none;
        }
      }
    `,
  ],
})
export class AuthImageComponent {
  /** The attachment content URL (requires bearer auth). */
  readonly src = input.required<string>();
  /** Accessible alt text / aria-label. */
  readonly alt = input<string>('');

  private readonly attachments = inject(AttachmentService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('idle');
  private readonly url = signal<string | null>(null);
  protected readonly objectUrl = computed(() => this.url() ?? '');
  /** Plain (non-signal) handle to the live object URL so revoke() does NOT read
   *  the `url` signal — otherwise the effect would depend on `url`, and setting
   *  it in the fetch callback would re-trigger the effect into an infinite
   *  fetch/revoke loop that revokes the blob the instant it loads. */
  private currentObjectUrl: string | null = null;

  constructor() {
    // Re-fetch whenever `src` changes; revoke the previous blob first.
    effect(() => {
      const src = this.src();
      this.revoke();
      this.state.set('loading');

      this.attachments
        .fetchBlobUrl(src)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (objectUrl) => {
            this.currentObjectUrl = objectUrl;
            this.url.set(objectUrl);
            this.state.set('loaded');
          },
          error: () => {
            this.currentObjectUrl = null;
            this.url.set(null);
            this.state.set('error');
          },
        });
    });

    this.destroyRef.onDestroy(() => this.revoke());
  }

  private revoke(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
      this.url.set(null);
    }
  }
}
