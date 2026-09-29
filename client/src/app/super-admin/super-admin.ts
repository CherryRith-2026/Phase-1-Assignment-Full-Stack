import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupApi } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-super-admin', imports: [RouterLink],
  templateUrl: './super-admin.html',
  styleUrls: ['../home/home.css', './super-admin.css']
})
export class SuperAdmin {
  readonly pendingCount = signal<number | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly session = inject(Session);
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() { this.loadCount(); }
  loadCount() {
    this.loading.set(true);
    this.error.set('');
    this.pendingCount.set(null);
    this.api.creationRequests(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: requests => {
        this.pendingCount.set(requests.filter(request => request.status === 'pending').length);
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.error.set(error.error?.message || 'Unable to load pending requests. Please retry.');
      }
    });
  }
}
