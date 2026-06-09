import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { CommentService } from './comment.service';
import { Comment } from './models';

describe('CommentService', () => {
  let service: CommentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CommentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CommentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists comments via GET /api/tasks/{id}/comments', () => {
    const comments = [{ id: 'c1' } as Comment];
    let received: Comment[] | undefined;
    service.list('task-1').subscribe((c) => (received = c));
    const req = http.expectOne('/api/tasks/task-1/comments');
    expect(req.request.method).toBe('GET');
    req.flush(comments);
    expect(received).toEqual(comments);
  });

  it('adds a comment via POST /api/tasks/{id}/comments with { body }', () => {
    service.add('task-1', 'Looks good').subscribe();
    const req = http.expectOne('/api/tasks/task-1/comments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Looks good' });
    req.flush({ id: 'c2', body: 'Looks good' } as Comment);
  });
});
