import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { DashboardComponent } from './dashboard.component';
import { TaskService } from '../../core/task.service';
import { UserService } from '../../core/user.service';
import { AuthService } from '../../core/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { FieldTask, FieldTaskStatus, Priority, TaskQuery, User } from '../../core/models';

function makeTask(over: Partial<FieldTask> = {}): FieldTask {
  return {
    id: 't1',
    title: 'Fix the pump',
    description: null,
    icon: '🔧',
    priority: Priority.Medium,
    labels: [],
    latitude: 48.3,
    longitude: 33.5,
    area: null,
    assigneeId: 'w-1',
    assigneeName: 'Worker One',
    deadline: '2030-01-01T00:00:00.000Z',
    status: FieldTaskStatus.Created,
    attachmentCount: 0,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let taskService: jasmine.SpyObj<TaskService>;
  let userService: jasmine.SpyObj<UserService>;
  let adminSignal: ReturnType<typeof signal<boolean>>;

  function setup(isAdmin: boolean, tasks: FieldTask[]): void {
    localStorage.clear();
    adminSignal = signal(isAdmin);
    taskService = jasmine.createSpyObj<TaskService>('TaskService', ['list']);
    taskService.list.and.returnValue(of(tasks));
    userService = jasmine.createSpyObj<UserService>('UserService', ['listWorkers']);
    userService.listWorkers.and.returnValue(of([{ id: 'w-1', displayName: 'Worker One' } as User]));

    const auth = { isAdmin: adminSignal.asReadonly() } as unknown as AuthService;

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: TaskService, useValue: taskService },
        { provide: UserService, useValue: userService },
        { provide: AuthService, useValue: auth },
        TranslationService,
      ],
    });
    TestBed.inject(TranslationService).setLang('en');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(DashboardComponent);
  }

  afterEach(() => {
    localStorage.clear();
    fixture?.destroy();
  });

  it('loads tasks (debounced) and renders a row per task', fakeAsync(() => {
    setup(true, [makeTask({ title: 'Fix the pump' }), makeTask({ id: 't2', title: 'Inspect line' })]);
    fixture.detectChanges();
    tick(300); // flush the 250ms debounce
    fixture.detectChanges();
    flush(); // drain Leaflet setTimeout(0) timers

    expect(taskService.list).toHaveBeenCalled();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.task-row:not(.skeleton)');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Fix the pump');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Inspect line');
  }));

  it('builds the query from the filter signals', fakeAsync(() => {
    setup(true, []);
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();
    flush();
    taskService.list.calls.reset();

    const comp = fixture.componentInstance as unknown as {
      search: { set(v: string): void };
      statusFilter: { set(v: FieldTaskStatus | null): void };
    };
    comp.search.set('pump');
    comp.statusFilter.set(FieldTaskStatus.Done);
    fixture.detectChanges();
    tick(300);
    flush();

    const lastQuery = taskService.list.calls.mostRecent().args[0] as TaskQuery;
    expect(lastQuery.search).toBe('pump');
    expect(lastQuery.status).toBe(FieldTaskStatus.Done);
  }));

  it('queries workers for the assignee filter when Admin', fakeAsync(() => {
    setup(true, []);
    fixture.detectChanges();
    tick(300);
    flush();
    expect(userService.listWorkers).toHaveBeenCalled();
  }));

  it('does NOT query workers when a Worker', fakeAsync(() => {
    setup(false, []);
    fixture.detectChanges();
    tick(300);
    flush();
    expect(userService.listWorkers).not.toHaveBeenCalled();
  }));

  it('shows the empty-state for an Admin with no tasks', fakeAsync(() => {
    setup(true, []);
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();
    flush();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No tasks yet. Create your first task',
    );
  }));
});
