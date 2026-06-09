import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { Role } from './core/models';
import { Lang, TranslationService } from './core/i18n/translation.service';
import { TranslatePipe } from './core/i18n/translate.pipe';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TranslatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly themeSvc = inject(ThemeService);
  private readonly i18n = inject(TranslationService);

  /** Expose Role enum to the template. */
  protected readonly Role = Role;

  /** Reactive current user (null when logged out). */
  protected readonly currentUser = this.auth.currentUser;
  protected readonly isAuthenticated = () => this.auth.isAuthenticated();

  /** Current theme ('light' | 'dark') for the toggle button. */
  protected readonly theme = this.themeSvc.theme;

  /** Active UI language for the nav toggle. */
  protected readonly lang = this.i18n.current;

  protected toggleTheme(): void {
    this.themeSvc.toggle();
  }

  protected setLang(lang: Lang): void {
    this.i18n.setLang(lang);
  }

  protected logout(): void {
    this.auth.logout();
  }
}
