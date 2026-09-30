import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuditLog, GroupApi } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-audit-logs',
  imports: [RouterLink],
  templateUrl: './audit-logs.html',
  styleUrls: ['../home/home.css', './audit-logs.css']
})
export class AuditLogs {
  readonly logs = signal<AuditLog[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly session = inject(Session);

  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.loadLogs();
  }

  loadLogs() {
    this.loading.set(true);
    this.error.set('');

    this.api.auditLogs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: logs => {
          this.logs.set(logs);
          this.loading.set(false);
        },
        error: error => {
          this.loading.set(false);
          this.error.set(
            error.error?.message || 'Unable to load audit logs.'
          );
        }
      });
  }

  actionLabel(action: string) {
    if (action === 'GROUP_CREATION_APPROVED') {
      return 'Group Creation Approved';
    }

    if (action === 'GROUP_CREATION_REJECTED') {
      return 'Group Creation Rejected';
    }

    return action;
  }

  formatDate(date: string) {
  return new Date(date).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
}