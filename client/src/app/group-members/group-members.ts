import { ActionIcon } from '../shared/action-icon';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupApi, GroupMember, PendingJoinRequest } from '../shared/group-api';

@Component({
  imports: [ActionIcon],
  selector: 'app-group-members', templateUrl: './group-members.html', styleUrl: './group-members.css'
})
export class GroupMembers {
  readonly groupId = input<number | null>(null);
  readonly members = signal<GroupMember[]>([]);
  readonly canManage = signal(false);
  readonly loading = signal(false);
  readonly promoting = signal<number | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly joinRequests = signal<PendingJoinRequest[]>([]);
  readonly reviewing = signal(false);
  readonly requestsLoading = signal(false);
  readonly requestError = signal('');
  readonly requestMessage = signal('');
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);

  constructor() {
    effect(onCleanup => {
      const id = this.groupId();
      this.joinRequests.set([]); this.requestError.set(''); this.requestMessage.set('');
      this.members.set([]); this.canManage.set(false); this.error.set(''); this.message.set('');
      if (id === null) return;
      this.loading.set(true);
      const subscription = this.api.groupMembers(id).subscribe({
        next: result => { this.members.set(result.members); this.canManage.set(result.canManage); this.loading.set(false); if (result.canManage) this.loadRequests(id); },
        error: error => { this.loading.set(false); this.error.set(error.error?.message || 'Unable to load group members. Please refresh.'); }
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
  loadRequests(id = this.groupId()) {
    if (id === null) return;
    this.requestsLoading.set(true); this.requestError.set('');
    this.api.pendingJoinRequests(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: requests => { if (this.groupId() === id) { this.joinRequests.set(requests); this.requestsLoading.set(false); } },
      error: error => {
        if (this.groupId() !== id) return;
        this.requestsLoading.set(false);
        this.requestError.set(error.error?.message || 'Unable to load join requests. Please retry.');
      }
    });
  }
  review(request: PendingJoinRequest, action: 'approve' | 'reject') {
    const id = this.groupId();
    if (id === null || !this.canManage() || this.reviewing() || (action === 'reject' && request.status !== 'pending')) return;
    this.reviewing.set(true); this.requestError.set(''); this.requestMessage.set('');
    this.api.resolveJoinRequest(id, request.id, action).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.reviewing.set(false);
        if (this.groupId() !== id) return;
        this.joinRequests.update(items => items.filter(item => item.id !== request.id));
        this.requestMessage.set(result.message);
        if (action === 'approve') {
          this.api.groupMembers(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: result => { if (this.groupId() === id) { this.members.set(result.members); this.canManage.set(result.canManage); } },
            error: () => this.error.set('Request approved, but members could not be refreshed. Reload the page.')
          });
        }
      },
      error: error => {
        this.reviewing.set(false);
        if (this.groupId() !== id) return;
        this.requestError.set(error.error?.message || 'Unable to process request. Refresh requests and retry.');
      }
    });
  }
  promote(member: GroupMember) {
    const id = this.groupId();
    if (id === null || !this.canManage() || member.isGroupAdmin || this.promoting() !== null) return;
    this.promoting.set(member.id); this.error.set(''); this.message.set('');
    this.api.promoteMember(id, member.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.promoting.set(null);
        if (this.groupId() !== id) return;
        this.members.update(members => members.map(item => item.id === member.id ? result.member : item));
        this.message.set(result.message);
      },
      error: error => {
        this.promoting.set(null);
        if (this.groupId() !== id) return;
        this.error.set(error.error?.message || 'Unable to promote member. Please refresh and retry.');
        if (error.status === 401 || error.status === 403) this.canManage.set(false);
      }
    });
  }
}
