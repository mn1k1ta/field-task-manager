import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../core/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { AuthResponse, Role, User } from '../../core/models';

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;

  function fill(username: string, password: string, displayName = ''): void {
    const el = fixture.nativeElement as HTMLElement;
    const set = (sel: string, value: string) => {
      const input = el.querySelector(sel) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('#reg-username', username);
    set('#reg-displayname', displayName);
    set('#reg-password', password);
    fixture.detectChanges();
  }

  function submit(): void {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  const created: User = { id: 'n1', username: 'bob', displayName: 'Bob', role: Role.Worker };

  beforeEach(async () => {
    localStorage.clear();
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['register', 'login']);
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        TranslationService,
      ],
    }).compileComponents();
    TestBed.inject(TranslationService).setLang('en');
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('creates and announces the Worker role', () => {
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Worker');
  });

  it('rejects a password shorter than 6 chars without calling register', () => {
    fill('bob', 'abc');
    submit();
    expect(auth.register).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Password must be at least 6 characters.',
    );
  });

  it('registers then auto-logs-in and navigates to /dashboard on success', () => {
    auth.register.and.returnValue(of(created));
    auth.login.and.returnValue(of({ token: 't', user: created } as AuthResponse));
    fill('bob', 'secret1', 'Bob');
    submit();
    expect(auth.register).toHaveBeenCalledWith('bob', 'secret1', 'Bob');
    expect(auth.login).toHaveBeenCalledWith('bob', 'secret1');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('omits an all-whitespace displayName (passes undefined)', () => {
    auth.register.and.returnValue(of(created));
    auth.login.and.returnValue(of({ token: 't', user: created } as AuthResponse));
    fill('bob', 'secret1', '   ');
    submit();
    expect(auth.register).toHaveBeenCalledWith('bob', 'secret1', undefined);
  });

  it('shows a username-taken error on 409', () => {
    auth.register.and.returnValue(throwError(() => ({ status: 409 })));
    fill('bob', 'secret1');
    submit();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'That username is already taken.',
    );
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('falls back to /login when auto-login fails after register', () => {
    auth.register.and.returnValue(of(created));
    auth.login.and.returnValue(throwError(() => ({ status: 401 })));
    fill('bob', 'secret1');
    submit();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
