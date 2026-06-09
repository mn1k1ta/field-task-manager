import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TaskService } from './task.service';
import { FieldTask, FieldTaskStatus } from './models';

describe('TaskService', () => {
  let service: TaskService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TaskService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TaskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('list — query string building', () => {
    it('hits /api/tasks with no params for an empty query', () => {
      service.list().subscribe();
      const req = http.expectOne((r) => r.url === '/api/tasks');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.keys().length).toBe(0);
      req.flush([]);
    });

    it('sets search, status, and assigneeId params when present', () => {
      service
        .list({ search: 'pump', status: FieldTaskStatus.Done, assigneeId: 'w-1' })
        .subscribe();
      const req = http.expectOne((r) => r.url === '/api/tasks');
      expect(req.request.params.get('search')).toBe('pump');
      expect(req.request.params.get('status')).toBe('2');
      expect(req.request.params.get('assigneeId')).toBe('w-1');
      req.flush([]);
    });

    it('serializes status 0 (Created) — does not drop a falsy enum value', () => {
      service.list({ status: FieldTaskStatus.Created }).subscribe();
      const req = http.expectOne((r) => r.url === '/api/tasks');
      expect(req.request.params.get('status')).toBe('0');
      req.flush([]);
    });

    it('omits empty search and empty assigneeId', () => {
      service.list({ search: '', assigneeId: '' }).subscribe();
      const req = http.expectOne((r) => r.url === '/api/tasks');
      expect(req.request.params.has('search')).toBeFalse();
      expect(req.request.params.has('assigneeId')).toBeFalse();
      req.flush([]);
    });

    it('returns the response body', () => {
      const tasks = [{ id: 't1' } as FieldTask];
      let received: FieldTask[] | undefined;
      service.list().subscribe((t) => (received = t));
      http.expectOne((r) => r.url === '/api/tasks').flush(tasks);
      expect(received).toEqual(tasks);
    });
  });

  describe('get', () => {
    it('GETs /api/tasks/{id}', () => {
      service.get('abc').subscribe();
      const req = http.expectOne('/api/tasks/abc');
      expect(req.request.method).toBe('GET');
      req.flush({ id: 'abc' } as FieldTask);
    });
  });

  describe('create', () => {
    it('POSTs the dto to /api/tasks', () => {
      const dto = {
        title: 'Fix pump',
        assigneeId: 'w-1',
        deadline: '2026-06-10T00:00:00.000Z',
        latitude: 1,
        longitude: 2,
      };
      service.create(dto).subscribe();
      const req = http.expectOne('/api/tasks');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush({ id: 'new' } as FieldTask);
    });
  });

  describe('update', () => {
    it('PUTs the dto to /api/tasks/{id}', () => {
      const dto = {
        title: 'Edited',
        assigneeId: 'w-2',
        deadline: '2026-06-11T00:00:00.000Z',
      };
      service.update('t9', dto).subscribe();
      const req = http.expectOne('/api/tasks/t9');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(dto);
      req.flush({ id: 't9' } as FieldTask);
    });
  });

  describe('remove', () => {
    it('DELETEs /api/tasks/{id}', () => {
      service.remove('t3').subscribe();
      const req = http.expectOne('/api/tasks/t3');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('setStatus', () => {
    it('PATCHes /api/tasks/{id}/status with { status }', () => {
      service.setStatus('t1', FieldTaskStatus.Verified).subscribe();
      const req = http.expectOne('/api/tasks/t1/status');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: FieldTaskStatus.Verified });
      req.flush({ id: 't1', status: FieldTaskStatus.Verified } as FieldTask);
    });
  });

  describe('setLocation', () => {
    it('PATCHes /api/tasks/{id}/location with latitude + longitude', () => {
      service.setLocation('t1', 49.1, 24.5).subscribe();
      const req = http.expectOne('/api/tasks/t1/location');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ latitude: 49.1, longitude: 24.5 });
      req.flush({ id: 't1' } as FieldTask);
    });
  });

  describe('setAssignee', () => {
    it('PATCHes /api/tasks/{id}/assignee with { assigneeId }', () => {
      service.setAssignee('t1', 'w-7').subscribe();
      const req = http.expectOne('/api/tasks/t1/assignee');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ assigneeId: 'w-7' });
      req.flush({ id: 't1' } as FieldTask);
    });
  });
});
