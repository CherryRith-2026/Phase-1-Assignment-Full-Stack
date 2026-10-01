import { ActionIcon } from '../shared/action-icon';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AvailableGroup, GroupApi } from '../shared/group-api';
import { Session } from '../shared/session';

@Component({
  selector: 'app-browse-groups',
  imports: [ActionIcon, RouterLink],
  templateUrl: './browse-groups.html',
  styleUrls: ['../home/home.css', './browse-groups.css']
})
export class BrowseGroups {
  readonly groups = signal<AvailableGroup[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly cancelling = signal<number[]>([]);
  readonly requesting = signal<number[]>([]);
  readonly session = inject(Session);
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() { this.loadGroups(); }

  // DEMO: Loads the join state and age message calculated by the backend.
  loadGroups() {
    this.loading.set(true);
    this.error.set('');
    this.api.availableGroups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: groups => { this.groups.set(groups); this.loading.set(false); },
      error: error => {
        this.loading.set(false);
        this.error.set(error.error?.message || 'Unable to load groups. Please retry.');
      }
    });
  }

  // DEMO: Cancels a pending request and refreshes this card's join state.
  cancelRequest(group: AvailableGroup) {
    if (group.joinState !== 'pending' || this.cancelling().includes(group.id)) return;
    this.cancelling.update(ids => [...ids, group.id]);
    this.error.set('');
    this.message.set('');
    this.api.cancelRequest(group.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.cancelling.update(ids => ids.filter(id => id !== group.id));
        this.groups.update(groups => groups.map(item => item.id === group.id
          ? { ...item, joinState: response.joinState, eligibilityMessage: response.eligibilityMessage } : item));
        this.message.set(response.message);
      },
      error: error => {
        this.cancelling.update(ids => ids.filter(id => id !== group.id));
        this.error.set(error.error?.message || 'Unable to cancel your request. Please retry.');
        // Reconcile a stale Pending card when another tab already cancelled it.
        const state = error.error?.joinState;
        if (['available', 'ineligible', 'member'].includes(state)) {
          this.groups.update(groups => groups.map(item => item.id === group.id
            ? { ...item, joinState: state, eligibilityMessage: error.error.eligibilityMessage || '' } : item));
        }
      }
    });
  }

  // DEMO: Requests approval instead of joining the group immediately.
  requestToJoin(group: AvailableGroup) {
    if (group.joinState !== 'available' || this.requesting().includes(group.id)) return;
    this.requesting.update(ids => [...ids, group.id]);
    this.error.set('');
    this.message.set('');
    this.api.requestToJoin(group.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.requesting.update(ids => ids.filter(id => id !== group.id));
        this.groups.update(groups => groups.map(item => item.id === group.id ? { ...item, joinState: response.joinState } : item));
        this.message.set(response.message);
      },
      error: error => {
        this.requesting.update(ids => ids.filter(id => id !== group.id));
        this.error.set(error.error?.message || 'Unable to send your request. Please retry.');
        // Another tab or a changed DOB can make our displayed state stale.
        const state = error.error?.joinState;
        if (['member', 'pending', 'ineligible'].includes(state)) {
          this.groups.update(groups => groups.map(item => item.id === group.id
            ? { ...item, joinState: state, eligibilityMessage: error.error.message } : item));
        }
      }
    });
  }
}
