import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AuthSceneComponent } from '../../shared/auth-scene.component';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * S2 Register. username + password (min 6) + displayName on the immersive
 * scene. Self-register as Worker (server forces the role). On success the user
 * is auto-logged-in and routed to /dashboard; if auto-login fails we fall back
 * to /login. A 409 surfaces inline on the username field; 400 surfaces a banner.
 */
@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthSceneComponent, TranslatePipe],
  template: `
    <app-auth-scene>
      <div class="glass-card">
        <h1 class="auth-title">{{ 'auth.createAccountTitle' | t }}</h1>
        <p class="auth-sub">
          {{ 'auth.joinAsPrefix' | t }} <span class="pill">{{ 'auth.workerPill' | t }}</span>
        </p>

        @if (error(); as errKey) {
          <div class="alert alert--error" role="alert">{{ errKey | t }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="form-field">
            <label class="form-label" for="reg-username">{{ 'auth.username' | t }}</label>
            <input
              id="reg-username"
              class="input"
              type="text"
              autocomplete="username"
              [placeholder]="'auth.chooseUsername' | t"
              formControlName="username"
              [class.is-invalid]="invalid('username') || !!usernameTaken()"
            />
            @if (usernameTaken()) {
              <span class="field-error">{{ 'auth.usernameTaken' | t }}</span>
            } @else if (invalid('username')) {
              <span class="field-error">{{ 'auth.usernameRequired' | t }}</span>
            }
          </div>

          <div class="form-field">
            <label class="form-label" for="reg-displayname">{{ 'auth.displayName' | t }}</label>
            <input
              id="reg-displayname"
              class="input"
              type="text"
              autocomplete="name"
              [placeholder]="'common.optional' | t"
              formControlName="displayName"
            />
            <span class="field-hint">{{ 'auth.displayNameHint' | t }}</span>
          </div>

          <div class="form-field">
            <label class="form-label" for="reg-password">{{ 'auth.password' | t }}</label>
            <input
              id="reg-password"
              class="input"
              type="password"
              autocomplete="new-password"
              [placeholder]="'auth.passwordMinPlaceholder' | t"
              formControlName="password"
              [class.is-invalid]="invalid('password')"
            />
            @if (invalid('password')) {
              <span class="field-error">{{ 'auth.passwordMin' | t }}</span>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--block" [disabled]="submitting()">
            {{ (submitting() ? 'auth.creating' : 'auth.createAccount') | t }}
          </button>
        </form>

        <p class="auth-foot">
          <a routerLink="/login">{{ 'auth.backToSignIn' | t }}</a>
        </p>
      </div>
    </app-auth-scene>
  `,
  styles: [
    `
      .glass-card {
        width: 100%;
        padding: var(--space-6);
        border-radius: var(--radius-xl);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        box-shadow: var(--shadow-lg);
        color: var(--color-text);
      }

      .auth-title {
        font-family: var(--font-head);
        font-size: 27px;
        line-height: 34px;
        margin-bottom: var(--space-1);
      }
      .auth-sub {
        margin: 0 0 var(--space-5);
        color: var(--color-text-muted);
        font-size: 14px;
      }
      .pill {
        display: inline-block;
        padding: 1px 9px;
        border-radius: var(--radius-full);
        background: var(--color-brand-subtle);
        color: var(--color-brand);
        font-weight: 500;
        font-size: 12px;
      }

      .alert--error {
        margin-bottom: var(--space-4);
      }

      .auth-foot {
        margin: var(--space-5) 0 0;
        text-align: center;
        font-size: 13px;
        color: var(--color-text-muted);
      }
      .auth-foot a {
        color: var(--color-brand);
        font-weight: 500;
      }
    `,
  ],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly usernameTaken = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    displayName: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected invalid(name: 'username' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit(): void {
    this.error.set(null);
    this.usernameTaken.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { username, password, displayName } = this.form.getRawValue();
    const trimmedDisplay = displayName.trim();
    this.submitting.set(true);

    this.auth.register(username, password, trimmedDisplay || undefined).subscribe({
      next: () => this.afterRegister(username, password),
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        if (err.status === 409) {
          this.usernameTaken.set(username);
        } else if (err.status === 400) {
          this.error.set('auth.errorCheckDetails');
        } else {
          this.error.set('auth.errorRegisterFailed');
        }
      },
    });
  }

  /** Auto-login after a successful register; fall back to /login. */
  private afterRegister(username: string, password: string): void {
    this.auth.login(username, password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.submitting.set(false);
        void this.router.navigate(['/login']);
      },
    });
  }
}
