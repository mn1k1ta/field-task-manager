import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Priority } from '../core/models';
import { PriorityChipComponent } from './priority-chip.component';
import { TranslationService } from '../core/i18n/translation.service';

describe('PriorityChipComponent', () => {
  let fixture: ComponentFixture<PriorityChipComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PriorityChipComponent],
      providers: [TranslationService],
    }).compileComponents();
    TestBed.inject(TranslationService).setLang('en');
    fixture = TestBed.createComponent(PriorityChipComponent);
  });

  afterEach(() => localStorage.clear());

  it('creates', () => {
    fixture.componentRef.setInput('priority', Priority.Low);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the localized priority label', () => {
    fixture.componentRef.setInput('priority', Priority.Urgent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Urgent');
  });

  it('sets the --pc color custom property from the priority palette', () => {
    fixture.componentRef.setInput('priority', Priority.High);
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector(
      '.priority-chip',
    ) as HTMLElement;
    // priority.util High = #fb8c00
    expect(chip.style.getPropertyValue('--pc').trim()).toBe('#fb8c00');
  });
});
