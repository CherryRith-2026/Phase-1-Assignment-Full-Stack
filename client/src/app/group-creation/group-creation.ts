import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupApi, CreationRequest } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-group-creation', imports: [FormsModule, RouterLink],
  templateUrl: './group-creation.html',
  styleUrls: ['../home/home.css', './group-creation.css']
})
export class GroupCreation {
  readonly review = inject(Router).url.startsWith('/group-requests');
  readonly requests = signal<CreationRequest[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly session = inject(Session);
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);
  name = ''; description = ''; minimumAge = 0; colour = '#728fce';

  constructor() { this.load(); }
  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.creationRequests(this.review).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: requests => { this.requests.set(requests.filter(request => request.status !== 'cancelled')); this.loading.set(false); },
      error: error => { this.loading.set(false); this.error.set(error.error?.message || 'Unable to load requests. Please retry.'); }
    });
  }
  submit() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.requestGroup({ name: this.name, description: this.description, minimumAge: this.minimumAge, colour: this.colour })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => {
          this.busy.set(false); this.message.set(result.message);
          this.requests.update(items => [result.request, ...items]);
          this.name = ''; this.description = ''; this.minimumAge = 0;
        },
        error: error => { this.busy.set(false); this.error.set(error.error?.message || 'Unable to submit request. Please retry.'); }
      });
  }
  cancel(request: CreationRequest) {
    if (this.review || this.busy() || request.status !== 'pending') return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.cancelCreation(request.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.busy.set(false); this.message.set(result.message);
        this.requests.update(items => items.filter(item => item.id !== request.id));
      },
      error: error => {
        this.busy.set(false);
        this.error.set(error.error?.message || 'Unable to cancel request. Please retry.');
        if (error.error?.request) {
          this.requests.update(items => items.map(item => item.id === request.id ? error.error.request : item)
            .filter(item => item.status !== 'cancelled'));
        }
      }
    });
  }
  resolve(request: CreationRequest, action: 'approve' | 'reject') {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.resolveCreation(request.id, action).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.busy.set(false); this.message.set(result.message);
        this.requests.update(items => items.filter(item => item.id !== request.id));
      },
      error: error => {
        this.busy.set(false);
        this.error.set(error.error?.message || 'Unable to resolve request. Refresh and retry approval if interrupted.');
      }
    });
  }
}
