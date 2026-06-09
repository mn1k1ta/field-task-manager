import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';

/**
 * Application routes (arch §10.1).
 *
 * Feature components are lazily loaded. Component file paths/class names are
 * fixed here and created in step 2:
 *   - features/login/login.component        -> LoginComponent
 *   - features/register/register.component   -> RegisterComponent
 *   - features/dashboard/dashboard.component -> DashboardComponent
 *   - features/task-detail/task-detail.component -> TaskDetailComponent
 *   - features/task-form/task-form.component -> TaskFormComponent
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'tasks/new',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/task-form/task-form.component').then((m) => m.TaskFormComponent),
  },
  {
    path: 'tasks/:id/edit',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/task-form/task-form.component').then((m) => m.TaskFormComponent),
  },
  {
    path: 'tasks/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/task-detail/task-detail.component').then((m) => m.TaskDetailComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
