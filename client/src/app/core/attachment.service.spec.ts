import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AttachmentService } from './attachment.service';
import { Attachment } from './models';

describe('AttachmentService', () => {
  let service: AttachmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AttachmentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AttachmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists attachments via GET .../attachments', () => {
    service.list('task-1').subscribe();
    const req = http.expectOne('/api/tasks/task-1/attachments');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  describe('upload', () => {
    it('POSTs multipart FormData with the file under field "file"', () => {
      const file = new File(['hello'], 'photo.png', { type: 'image/png' });
      service.upload('task-1', file).subscribe();

      const req = http.expectOne('/api/tasks/task-1/attachments');
      expect(req.request.method).toBe('POST');
      expect(req.request.body instanceof FormData).toBeTrue();

      const form = req.request.body as FormData;
      const sent = form.get('file');
      expect(sent instanceof File).toBeTrue();
      expect((sent as File).name).toBe('photo.png');

      req.flush({ id: 'a1', fileName: 'photo.png' } as Attachment);
    });
  });

  describe('delete', () => {
    it('DELETEs .../attachments/{attId}', () => {
      service.delete('task-1', 'att-9').subscribe();
      const req = http.expectOne('/api/tasks/task-1/attachments/att-9');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('fetchBlobUrl', () => {
    it('GETs the url as a blob and wraps it in an object URL', () => {
      const fakeUrl = 'blob:http://localhost/fake-123';
      const createSpy = spyOn(URL, 'createObjectURL').and.returnValue(fakeUrl);

      let result: string | undefined;
      service
        .fetchBlobUrl('/api/tasks/task-1/attachments/att-9/content')
        .subscribe((u) => (result = u));

      const req = http.expectOne('/api/tasks/task-1/attachments/att-9/content');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      const blob = new Blob(['bytes'], { type: 'image/png' });
      req.flush(blob);

      expect(createSpy).toHaveBeenCalledWith(blob);
      expect(result).toBe(fakeUrl);
    });
  });
});
