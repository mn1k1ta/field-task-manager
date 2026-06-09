import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskFormComponent } from './task-form.component';
import { TaskService } from '../../core/task.service';
import { UserService } from '../../core/user.service';
import { AttachmentService } from '../../core/attachment.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { CreateTaskRequest, FieldTask, User } from '../../core/models';

/** Minimal protected-surface view of the component for white-box assertions. */
interface FormInternals {
  form: {
    setValue(v: Record<string, unknown>): void;
    patchValue(v: Record<string, unknown>): void;
    invalid: boolean;
    valid: boolean;
    controls: Record<string, { setValue(v: unknown): void }>;
  };
  hasLocation(): boolean;
  lat: { set(v: number | null): void };
  lng: { set(v: number | null): void };
  error(): string | null;
  submit(): void;
}

describe('TaskFormComponent (create mode)', () => {
  let fixture: ComponentFixture<TaskFormComponent>;
  let taskService: jasmine.SpyObj<TaskService>;
  let comp: FormInternals;

  function validForm(): void {
    comp.form.patchValue({
      title: 'Fix pump',
      description: '',
      assigneeId: 'w-1',
      deadline: '2030-01-01T10:00',
    });
  }

  beforeEach(() => {
    localStorage.clear();
    taskService = jasmine.createSpyObj<TaskService>('TaskService', [
      'create',
      'update',
      'get',
      'setLocation',
    ]);
    const userService = jasmine.createSpyObj<UserService>('UserService', ['listWorkers']);
    userService.listWorkers.and.returnValue(
      of([{ id: 'w-1', displayName: 'Worker One' } as User]),
    );
    const attachmentService = jasmine.createSpyObj<AttachmentService>('AttachmentService', [
      'list',
      'upload',
      'delete',
    ]);

    TestBed.configureTestingModule({
      imports: [TaskFormComponent],
      providers: [
        provideRouter([]),
        { provide: TaskService, useValue: taskService },
        { provide: UserService, useValue: userService },
        { provide: AttachmentService, useValue: attachmentService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        TranslationService,
      ],
    });
    TestBed.inject(TranslationService).setLang('en');
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(TaskFormComponent);
    comp = fixture.componentInstance as unknown as FormInternals;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('starts invalid (title, assignee, deadline are required)', () => {
    expect(comp.form.invalid).toBeTrue();
  });

  it('becomes valid once required fields are filled', () => {
    validForm();
    expect(comp.form.valid).toBeTrue();
  });

  it('treats a whitespace-only title as invalid (notBlank validator)', () => {
    validForm();
    comp.form.controls['title'].setValue('   ');
    expect(comp.form.invalid).toBeTrue();
  });

  it('hasLocation is false until coordinates are set', () => {
    expect(comp.hasLocation()).toBeFalse();
    comp.lat.set(48.3);
    comp.lng.set(33.5);
    expect(comp.hasLocation()).toBeTrue();
  });

  it('does not create when the form is invalid', () => {
    comp.submit();
    expect(taskService.create).not.toHaveBeenCalled();
  });

  it('blocks submit with a location error when the form is valid but no location is set', () => {
    validForm();
    comp.submit();
    expect(taskService.create).not.toHaveBeenCalled();
    expect(comp.error()).toBe('Click the map to set the task location.');
  });

  it('creates the task once form + location are valid', fakeAsync(() => {
    taskService.create.and.returnValue(of({ id: 'new-1' } as FieldTask));
    validForm();
    comp.lat.set(48.3);
    comp.lng.set(33.5);

    comp.submit();
    flush();

    expect(taskService.create).toHaveBeenCalledTimes(1);
    const dto = taskService.create.calls.mostRecent().args[0] as CreateTaskRequest;
    expect(dto.title).toBe('Fix pump');
    expect(dto.assigneeId).toBe('w-1');
    expect(dto.latitude).toBe(48.3);
    expect(dto.longitude).toBe(33.5);
    expect(typeof dto.deadline).toBe('string'); // converted to UTC ISO
  }));
});
