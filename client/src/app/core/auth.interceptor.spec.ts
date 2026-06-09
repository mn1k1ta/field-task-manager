import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;

  function setup(token: string | null): void {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['token', 'logout']);
    auth.token.and.returnValue(token);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  it('attaches Authorization: Bearer when a token exists', () => {
    setup('jwt-abc');
    http.get('/api/tasks').subscribe();
    const req = httpMock.expectOne('/api/tasks');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-abc');
    req.flush([]);
  });

  it('does not attach Authorization when there is no token', () => {
    setup(null);
    http.get('/api/tasks').subscribe();
    const req = httpMock.expectOne('/api/tasks');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('calls logout on a 401 from a protected endpoint', () => {
    setup('jwt-abc');
    http.get('/api/tasks').subscribe({ next: () => {}, error: () => {} });
    const req = httpMock.expectOne('/api/tasks');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('does NOT call logout on a 401 from an auth endpoint (no logout loop)', () => {
    setup(null);
    http.post('/api/auth/login', {}).subscribe({ next: () => {}, error: () => {} });
    const req = httpMock.expectOne('/api/auth/login');
    req.flush('bad creds', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('does not call logout on a non-401 error', () => {
    setup('jwt-abc');
    http.get('/api/tasks').subscribe({ next: () => {}, error: () => {} });
    const req = httpMock.expectOne('/api/tasks');
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('propagates the error to the caller', () => {
    setup('jwt-abc');
    let status: number | undefined;
    http.get('/api/tasks').subscribe({ next: () => {}, error: (e) => (status = e.status) });
    httpMock.expectOne('/api/tasks').flush('no', { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
  });
});
