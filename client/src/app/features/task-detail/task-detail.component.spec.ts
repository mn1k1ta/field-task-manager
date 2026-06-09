import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { TaskDetailComponent } from './task-detail.component';
import { TaskService } from '../../core/task.service';
import { CommentService } from '../../core/comment.service';
import { AttachmentService } from '../../core/attachment.service';
import { AuthService } from '../../core/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { FieldTask, FieldTaskStatus, Priority, Role, User } from '../../core/models';

const ADMIN: User = { id: 'admin-1', username: 'admin', displayName: 'Admin', role: Role.Admin };
const WORKER: User = { id: 'w-1', username: 'bob', displayName: 'Bob', role: Role.Worker };

function makeTask(over: Partial<FieldTask> = {}): FieldTask {
  return {
    id: 't1',
    title: 'Fix the pump',
    description: 'Some **markdown** body',
    icon: '🔧',
    priority: Priority.High,
    labels: ['urgent'],
    latitude: 48.3,
    longitude: 33.5,
    area: null,
    assigneeId: 'w-1',
    assigneeName: 'Bob',
    deadline: '2030-01-01T00:00:00.000Z',
    status: FieldTaskStatus.Created,
    attachmentCount: 0,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('TaskDetailComponent', () => {
  let fixture: ComponentFixture<TaskDetailComponent>;
  let taskService: jasmine.SpyObj<TaskService>;
  let commentService: jasmine.SpyObj<CommentService>;

  function setup(user: User, task: FieldTask): void {
    taskService = jasmine.createSpyObj<TaskService>('TaskService', ['get', 'setStatus', 'remove']);
    taskService.get.and.returnValue(of(task));
    taskService.setStatus.and.returnValue(of({ ...task, status: FieldTaskStatus.InProgress }));
    commentService = jasmine.createSpyObj<CommentService>('CommentService', ['list', 'add']);
    commentService.list.and.returnValue(of([]));
    const attachmentService = jasmine.createSpyObj<AttachmentService>('AttachmentService', [
      'list',
    ]);
    attachmentService.list.and.returnValue(of([]));

    const auth = {
      currentUser: signal(user).asReadonly(),
      isAdmin: signal(user.role === Role.Admin).asReadonly(),
    } as unknown as AuthService;

    TestBed.configureTestingModule({
      imports: [TaskDetailComponent],
      providers: [
        provideRouter([]),
        { provide: TaskService, useValue: taskService },
        { provide: CommentService, useValue: commentService },
        { provide: AttachmentService, useValue: attachmentService },
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } },
        },
        TranslationService,
      ],
    });
    TestBed.inject(TranslationService).setLang('en');
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(TaskDetailComponent);
  }

  function render(): void {
    fixture.detectChanges();
    flush(); // drain Leaflet setTimeout timers
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('renders the task title and metadata', fakeAsync(() => {
    setup(ADMIN, makeTask());
    render();
    expect(text()).toContain('Fix the pump');
    expect(text()).toContain('Bob'); // assignee name
    expect(taskService.get).toHaveBeenCalledWith('t1');
  }));

  it('Worker assignee on a Created task sees "Start work"', fakeAsync(() => {
    setup(WORKER, makeTask({ status: FieldTaskStatus.Created }));
    render();
    expect(text()).toContain('Start work');
    expect(text()).not.toContain('Mark as Done');
    expect(text()).not.toContain('Verify (confirm closure)');
  }));

  it('Worker assignee on an In Progress task sees "Mark as Done"', fakeAsync(() => {
    setup(WORKER, makeTask({ status: FieldTaskStatus.InProgress }));
    render();
    expect(text()).toContain('Mark as Done');
    expect(text()).not.toContain('Start work');
  }));

  it('Worker on a Done task sees the waiting-verification note and no actions', fakeAsync(() => {
    setup(WORKER, makeTask({ status: FieldTaskStatus.Done }));
    render();
    expect(text()).toContain('Waiting for verification by the dispatcher.');
    expect(text()).not.toContain('Verify (confirm closure)');
  }));

  it('Admin on a Done task sees Verify + Reopen + Delete', fakeAsync(() => {
    setup(ADMIN, makeTask({ status: FieldTaskStatus.Done }));
    render();
    expect(text()).toContain('Verify (confirm closure)');
    expect(text()).toContain('Reopen (return to work)');
    expect(text()).toContain('Delete task');
  }));

  it('Admin on a Verified task sees Reopen but not Verify', fakeAsync(() => {
    setup(ADMIN, makeTask({ status: FieldTaskStatus.Verified }));
    render();
    expect(text()).toContain('Reopen (return to work)');
    expect(text()).not.toContain('Verify (confirm closure)');
  }));

  it('clicking "Start work" transitions the task to In Progress', fakeAsync(() => {
    setup(WORKER, makeTask({ status: FieldTaskStatus.Created }));
    render();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.actions button'),
    ) as HTMLButtonElement[];
    const startBtn = buttons.find((b) => b.textContent?.includes('Start work'));
    expect(startBtn).toBeTruthy();
    startBtn!.click();
    flush();
    expect(taskService.setStatus).toHaveBeenCalledWith('t1', FieldTaskStatus.InProgress);
  }));

  it('shows the not-available error when the task load 404s', fakeAsync(() => {
    setup(ADMIN, makeTask());
    // The component loads its task in the constructor, so the 404 must be arranged
    // BEFORE the instance is created — re-create it after overriding the get() spy.
    taskService.get.and.returnValue(throwError(() => ({ status: 404 })));
    fixture = TestBed.createComponent(TaskDetailComponent);
    render();
    expect(text()).toContain('This task is no longer available to you.');
  }));
});
