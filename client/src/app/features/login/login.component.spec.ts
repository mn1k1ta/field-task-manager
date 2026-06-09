import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { AuthResponse } from '../../core/models';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let auth: jasmine.SpyObj<AuthService>;
  let router: Router;

  function fill(username: string, password: string): void {
    const el = fixture.nativeElement as HTMLElement;
    const u = el.querySelector('#login-username') as HTMLInputElement;
    const p = el.querySelector('#login-password') as HTMLInputElement;
    u.value = username;
    u.dispatchEvent(new Event('input'));
    p.value = password;
    p.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login']);
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        TranslationService,
      ],
    }).compileComponents();
    TestBed.inject(TranslationService).setLang('en');
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('creates and renders the sign-in form', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sign in');
  });

  it('does not call login when the form is empty/invalid', () => {
    submit();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('calls AuthService.login with the entered credentials and navigates on success', () => {
    auth.login.and.returnValue(of({ token: 't', user: {} } as AuthResponse));
    fill('alice', 'pw123');
    submit();
    expect(auth.login).toHaveBeenCalledWith('alice', 'pw123');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows the bad-credentials error on a 401', () => {
    auth.login.and.returnValue(throwError(() => ({ status: 401 })));
    fill('alice', 'wrong');
    submit();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('.alert--error');
    expect(alert?.textContent).toContain('Incorrect username or password.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows a generic error on a non-401 failure', () => {
    auth.login.and.returnValue(throwError(() => ({ status: 500 })));
    fill('alice', 'pw');
    submit();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('.alert--error');
    expect(alert?.textContent).toContain('Could not log in. Please try again.');
  });
});
