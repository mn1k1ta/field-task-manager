import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { UserService } from './user.service';
import { Role, User } from './models';

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [UserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists workers via GET /api/users?role=1', () => {
    const workers = [{ id: 'w1', role: Role.Worker } as User];
    let received: User[] | undefined;
    service.listWorkers().subscribe((w) => (received = w));

    const req = http.expectOne((r) => r.url === '/api/users');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('role')).toBe('1');
    expect(req.request.params.get('role')).toBe(String(Role.Worker));
    req.flush(workers);

    expect(received).toEqual(workers);
  });
});
