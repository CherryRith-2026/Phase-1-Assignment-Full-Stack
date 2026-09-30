import { ActionIcon } from '../shared/action-icon';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GroupApi } from '../shared/group-api';

@Component({
  imports: [ActionIcon],
  selector: 'app-leave-group',
  template: `
    @if (error()) { <p role="alert">{{ error() }}</p> }
    @if (selectedId() !== null) {
      <button type="button" (click)="leave()" [disabled]="busy()" class="fab-icon-action fab-danger" aria-label="Leave group" title="Leave group"><app-action-icon name="leave" /><span class="fab-action-label">{{ busy() ? 'Leaving…' : 'Leave Group' }}</span></button>
    }
  `,
  styles: `:host { display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 16px; }
    button { background: #728fce; padding: 10px 15px; border: 0; border-radius: 6px; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; } [role="alert"] { color: #a51d2d; }`
})
export class LeaveGroup implements OnInit {
  readonly groupId = input<number>();
  readonly groupName = input<string>();
  readonly selectedId = signal<number | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  private api = inject(GroupApi);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    if (this.groupId() !== undefined) { this.selectedId.set(this.groupId()!); return; }
    // Existing Study/Music pages keep their chat layout. Resolve the actual
    // membership rather than guessing an ID from the group name.
    const id = this.route.snapshot.queryParamMap.get('groupId');
    this.api.myGroups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: groups => this.selectedId.set(groups.find(group =>
        (id === null ? group.name === this.groupName() : group.id === Number(id)))?.id ?? null),
      error: error => this.error.set(error.error?.message || 'Unable to load your group membership. Reload to retry.')
    });
  }
  leave() {
    const id = this.selectedId();
    if (id === null || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.leaveGroup(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.router.navigate(['/home']); },
      error: error => {
        this.busy.set(false);
        this.error.set(error.error?.message || 'Unable to leave the group. Please retry.');
      }
    });
  }
}
