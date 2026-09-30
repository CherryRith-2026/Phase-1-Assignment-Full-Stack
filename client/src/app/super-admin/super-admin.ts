import { ActionIcon } from '../shared/action-icon';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupApi, CreationRequest } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-super-admin',
  imports: [ActionIcon, RouterLink],
  templateUrl: './super-admin.html',
  styleUrls: ['../home/home.css', './super-admin.css']
})
export class SuperAdmin {
  readonly pendingCount = signal<number | null>(null);
  readonly pendingRequests = signal<CreationRequest[]>([]);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly loading = signal(false);
  readonly error = signal('');

  readonly session = inject(Session);

  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.loadRequests();
  }

  loadRequests() {
    this.loading.set(true);
    this.error.set('');

    this.api.creationRequests(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: requests => {
          const pending = requests.filter(
            request => request.status === 'pending'
          );

          this.pendingRequests.set(pending);
          this.pendingCount.set(pending.length);
          this.loading.set(false);
        },
        error: error => {
          this.loading.set(false);
          this.error.set(
            error.error?.message ||
            'Unable to load pending requests. Please retry.'
          );
        }
      });
  }

  resolve(request: CreationRequest, action: 'approve' | 'reject') {
    if (this.busy()) return;

    this.busy.set(true);
    this.error.set('');
    this.message.set('');

    this.api.resolveCreation(request.id, action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.busy.set(false);
          this.message.set(result.message);

          this.pendingRequests.update(items =>
            items.filter(item => item.id !== request.id)
          );

          this.pendingCount.update(count =>
            count === null ? 0 : Math.max(0, count - 1)
          );
        },
        error: error => {
          this.busy.set(false);
          this.error.set(
            error.error?.message ||
            'Unable to resolve request. Refresh and retry.'
          );
        }
      });
  }
}