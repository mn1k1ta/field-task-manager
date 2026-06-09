import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldTaskStatus } from '../core/models';
import { StatusBadgeComponent } from './status-badge.component';
import { TranslationService } from '../core/i18n/translation.service';

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
      providers: [TranslationService],
    }).compileComponents();
    TestBed.inject(TranslationService).setLang('en');
    fixture = TestBed.createComponent(StatusBadgeComponent);
  });

  afterEach(() => localStorage.clear());

  it('creates', () => {
    fixture.componentRef.setInput('status', FieldTaskStatus.Created);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the localized label and the status color dot', () => {
    fixture.componentRef.setInput('status', FieldTaskStatus.Verified);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Verified');

    const dot = (fixture.nativeElement as HTMLElement).querySelector(
      '.status-dot',
    ) as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(67, 160, 71)'); // #43a047
  });

  it('updates when the status input changes', () => {
    fixture.componentRef.setInput('status', FieldTaskStatus.Created);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Created');

    fixture.componentRef.setInput('status', FieldTaskStatus.Done);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Done');
  });
});
