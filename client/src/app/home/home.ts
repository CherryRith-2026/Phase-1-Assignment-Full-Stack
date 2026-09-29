import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Group, GroupApi } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  // Display hint only; Express independently authorizes every review request.
  readonly superAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('currentUser') || '{}').role === 'superAdmin'; }
    catch { return false; }
  })();
  readonly groups = signal<Group[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly session = inject(Session);
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() { this.loadGroups(); }

  loadGroups() {
    this.loading.set(true);
    this.error.set('');
    // The backend returns memberships for the authenticated user only.
    this.api.myGroups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: groups => { this.groups.set(groups); this.loading.set(false); },
      error: error => {
        this.loading.set(false);
        this.error.set(error.error?.message || 'Unable to load your groups. Please retry.');
      }
    });
  }
}
