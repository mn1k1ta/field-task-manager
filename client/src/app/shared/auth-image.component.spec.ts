import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { AuthImageComponent } from './auth-image.component';
import { AttachmentService } from '../core/attachment.service';

describe('AuthImageComponent', () => {
  let fixture: ComponentFixture<AuthImageComponent>;
  let attachments: jasmine.SpyObj<AttachmentService>;

  function setup(): void {
    attachments = jasmine.createSpyObj<AttachmentService>('AttachmentService', ['fetchBlobUrl']);
    TestBed.configureTestingModule({
      imports: [AuthImageComponent],
      providers: [{ provide: AttachmentService, useValue: attachments }],
    });
    fixture = TestBed.createComponent(AuthImageComponent);
  }

  it('fetches the blob URL for the src and shows the image when loaded', () => {
    setup();
    attachments.fetchBlobUrl.and.returnValue(of('blob:loaded-1'));
    fixture.componentRef.setInput('src', '/api/tasks/1/attachments/a/content');
    fixture.componentRef.setInput('alt', 'A photo');
    fixture.detectChanges(); // runs the effect

    expect(attachments.fetchBlobUrl).toHaveBeenCalledWith('/api/tasks/1/attachments/a/content');
    const img = (fixture.nativeElement as HTMLElement).querySelector(
      'img.auth-image__img',
    ) as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('blob:loaded-1');
    expect(img.alt).toBe('A photo');
  });

  it('shows the error placeholder when the fetch fails', () => {
    setup();
    attachments.fetchBlobUrl.and.returnValue(throwError(() => new Error('boom')));
    fixture.componentRef.setInput('src', '/api/x');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.auth-image__state--error')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('img')).toBeNull();
  });

  it('re-fetches and revokes the previous blob when src changes', () => {
    setup();
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    const first = new Subject<string>();
    const second = new Subject<string>();
    attachments.fetchBlobUrl.and.returnValues(first.asObservable(), second.asObservable());

    fixture.componentRef.setInput('src', '/api/first');
    fixture.detectChanges();
    first.next('blob:first');
    fixture.detectChanges();

    // Change src → previous blob revoked, new fetch issued.
    fixture.componentRef.setInput('src', '/api/second');
    fixture.detectChanges();
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(attachments.fetchBlobUrl).toHaveBeenCalledTimes(2);

    second.next('blob:second');
    fixture.detectChanges();
    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('blob:second');
  });

  it('revokes the live object URL on destroy', () => {
    setup();
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    attachments.fetchBlobUrl.and.returnValue(of('blob:live'));
    fixture.componentRef.setInput('src', '/api/x');
    fixture.detectChanges();

    fixture.destroy();
    expect(revokeSpy).toHaveBeenCalledWith('blob:live');
  });
});
