import { TestBed } from '@angular/core/testing';
import { TranslatePipe } from './translate.pipe';
import { TranslationService } from './translation.service';

describe('TranslatePipe', () => {
  let pipe: TranslatePipe;
  let i18n: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [TranslationService] });
    i18n = TestBed.inject(TranslationService);
    pipe = TestBed.runInInjectionContext(() => new TranslatePipe());
  });

  afterEach(() => localStorage.clear());

  it('transforms a key in the active language', () => {
    i18n.setLang('en');
    expect(pipe.transform('auth.signIn')).toBe('Sign in');
  });

  it('passes params through for interpolation', () => {
    i18n.setLang('en');
    expect(pipe.transform('comment.heading', { count: 2 })).toBe('Comments (2)');
  });

  it('reflects a language change on the next transform (impure pipe)', () => {
    i18n.setLang('en');
    expect(pipe.transform('common.save')).toBe('Save');
    i18n.setLang('uk');
    expect(pipe.transform('common.save')).toBe('Зберегти');
  });
});
