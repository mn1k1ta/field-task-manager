import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '../core/i18n/translate.pipe';

/**
 * Branded full-screen backdrop for the auth screens (login / register), styled
 * in the Diia visual language: clean themed surface, a faint map grid, a few
 * drifting status-colored pins and the brand lockup, with the auth card
 * projected on top via <ng-content>. Theme-aware (light + dark) and decorative
 * only (aria-hidden); the projected form carries all semantics. Honors
 * prefers-reduced-motion.
 */
@Component({
  selector: 'app-auth-scene',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene">
      <div class="scene__bg" aria-hidden="true">
        <div class="grid"></div>
        <div class="glow glow--1"></div>
        <div class="glow glow--2"></div>

        <span class="float-pin p1" style="--c: #2b6cf6">📍</span>
        <span class="float-pin p2" style="--c: #19a974">🔧</span>
        <span class="float-pin p3" style="--c: #f5a623">🚧</span>
        <span class="float-pin p4" style="--c: #98a1b0">📦</span>
        <span class="float-pin p5" style="--c: #2b6cf6">⚡</span>
      </div>

      <div class="scene__brand" aria-hidden="true">
        <span class="scene__glyph">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <path
              d="M12 2c-3.9 0-7 3.05-7 6.82C5 13.8 12 22 12 22s7-8.2 7-13.18C19 5.05 15.9 2 12 2Z"
              fill="currentColor"
            />
            <circle cx="12" cy="8.8" r="2.6" class="scene__glyph-dot" />
          </svg>
        </span>
        <span class="scene__brandname">Field Task Manager</span>
      </div>

      <div class="scene__content">
        <ng-content />
      </div>

      <p class="scene__foot" aria-hidden="true">{{ 'common.tagline' | t }}</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 100vh;
      }

      .scene {
        position: relative;
        height: 100%;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-5);
        overflow: hidden;
        background: var(--color-bg);
      }

      .scene__bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      /* Faint Diia-style map grid */
      .grid {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(
            color-mix(in srgb, var(--color-text) 6%, transparent) 1px,
            transparent 1px
          ),
          linear-gradient(
            90deg,
            color-mix(in srgb, var(--color-text) 6%, transparent) 1px,
            transparent 1px
          );
        background-size: 40px 40px;
        mask-image: radial-gradient(ellipse 75% 70% at 50% 45%, #000 30%, transparent 80%);
        -webkit-mask-image: radial-gradient(ellipse 75% 70% at 50% 45%, #000 30%, transparent 80%);
      }

      /* Soft accent glows */
      .glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.5;
      }
      .glow--1 {
        width: 480px;
        height: 480px;
        top: -140px;
        right: -100px;
        background: radial-gradient(
          circle,
          color-mix(in srgb, var(--color-brand) 45%, transparent),
          transparent 70%
        );
        animation: drift1 20s ease-in-out infinite;
      }
      .glow--2 {
        width: 420px;
        height: 420px;
        bottom: -160px;
        left: -120px;
        background: radial-gradient(circle, rgba(25, 169, 116, 0.4), transparent 70%);
        animation: drift2 24s ease-in-out infinite;
      }
      @keyframes drift1 {
        0%,
        100% {
          transform: translate(0, 0) scale(1);
        }
        50% {
          transform: translate(-40px, 36px) scale(1.08);
        }
      }
      @keyframes drift2 {
        0%,
        100% {
          transform: translate(0, 0) scale(1);
        }
        50% {
          transform: translate(50px, -28px) scale(1.1);
        }
      }

      /* Floating circular status pins with a glyph */
      .float-pin {
        position: absolute;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--color-surface);
        border: 1.5px solid color-mix(in srgb, var(--c) 45%, var(--color-border));
        box-shadow:
          0 0 0 4px color-mix(in srgb, var(--c) 14%, transparent),
          var(--shadow-md);
        font-size: 18px;
        animation: floaty 9s ease-in-out infinite;
      }
      .p1 {
        top: 20%;
        left: 15%;
        animation-delay: 0s;
      }
      .p2 {
        top: 66%;
        left: 22%;
        animation-delay: 1.2s;
      }
      .p3 {
        top: 28%;
        left: 80%;
        animation-delay: 2.1s;
      }
      .p4 {
        top: 74%;
        left: 72%;
        animation-delay: 0.6s;
      }
      .p5 {
        top: 50%;
        left: 86%;
        animation-delay: 3s;
      }
      @keyframes floaty {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-14px);
        }
      }

      /* Brand lockup, top-left */
      .scene__brand {
        position: absolute;
        top: var(--space-5);
        left: var(--space-6);
        display: flex;
        align-items: center;
        gap: var(--space-2);
        z-index: 2;
      }
      .scene__glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
        color: var(--color-on-action);
        background: var(--color-action);
      }
      .scene__glyph-dot {
        fill: var(--color-action);
      }
      .scene__brandname {
        font-family: var(--font-head);
        font-size: 15px;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--color-text);
      }

      .scene__content {
        position: relative;
        z-index: 2;
        width: 100%;
        max-width: 420px;
        animation: rise 0.55s var(--ease-out) both;
      }
      @keyframes rise {
        0% {
          opacity: 0;
          transform: translateY(16px) scale(0.99);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .scene__foot {
        position: absolute;
        bottom: var(--space-5);
        left: 0;
        right: 0;
        text-align: center;
        margin: 0;
        font-size: 12px;
        letter-spacing: 0.02em;
        color: var(--color-text-faint);
        z-index: 2;
      }

      @media (max-width: 560px) {
        .scene__brand {
          left: var(--space-4);
          top: var(--space-4);
        }
        .scene__foot {
          display: none;
        }
        .float-pin {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .glow,
        .float-pin,
        .scene__content {
          animation: none;
        }
      }
    `,
  ],
})
export class AuthSceneComponent {}
