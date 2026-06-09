import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AuthSceneComponent } from '../../shared/auth-scene.component';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * S1 Login. Username + password reactive form on an immersive full-screen
 * scene. On success stores the JWT and navigates to /dashboard. A 401 surfaces
 * an inline error banner with inputs preserved. Links to /register.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthSceneComponent, TranslatePipe],
  template: `
    <app-auth-scene>
      <div class="glass-card">
        <h1 class="auth-title">{{ 'auth.welcomeBack' | t }}</h1>
        <p class="auth-sub">{{ 'auth.loginSubtitle' | t }}</p>

        @if (error(); as errKey) {
          <div class="alert alert--error" role="alert">{{ errKey | t }}</div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="form-field">
            <label class="form-label" for="login-username">{{ 'auth.username' | t }}</label>
            <input
              id="login-username"
              class="input"
              type="text"
              autocomplete="username"
              [placeholder]="'auth.usernamePlaceholder' | t"
              formControlName="username"
              [class.is-invalid]="invalid('username')"
            />
            @if (invalid('username')) {
              <span class="field-error">{{ 'auth.usernameRequired' | t }}</span>
            }
          </div>

          <div class="form-field">
            <label class="form-label" for="login-password">{{ 'auth.password' | t }}</label>
            <input
              id="login-password"
              class="input"
              type="password"
              autocomplete="current-password"
              [placeholder]="'auth.passwordPlaceholder' | t"
              formControlName="password"
              [class.is-invalid]="invalid('password')"
            />
            @if (invalid('password')) {
              <span class="field-error">{{ 'auth.passwordRequired' | t }}</span>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--block" [disabled]="submitting()">
            {{ (submitting() ? 'auth.signingIn' : 'auth.signIn') | t }}
          </button>
        </form>

        <p class="auth-foot">
          {{ 'auth.newHere' | t }} <a routerLink="/register">{{ 'auth.createAccountLink' | t }}</a>
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
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  protected invalid(name: 'username' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit(): void {
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.login(username, password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/dashboard']);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.error.set(err.status === 401 ? 'auth.errorBadCredentials' : 'auth.errorLoginFailed');
      },
    });
  }
}
