import { ActionIcon } from '../shared/action-icon';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RoomChat } from '../room-chat/room-chat';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Group, GroupApi } from '../shared/group-api';

@Component({ selector: 'app-group-rooms', imports: [ActionIcon, FormsModule, RoomChat], templateUrl: './group-rooms.html', styleUrls: [
  '../group-settings/group-settings.css',
  './group-rooms.css'
]})
export class GroupRooms {
  readonly group = input.required<Group>();
  readonly selected = signal<string | null>(null);
  readonly rooms = signal<string[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  newName = ''; editing: string | null = null; renamed = '';
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);
  constructor() {
    effect(onCleanup => {
      const id = this.group().id;
      this.error.set(''); this.editing = null;
      const subscription = this.api.groupRooms(id).subscribe({
        next: rooms => this.rooms.set(rooms),
        error: error => this.error.set(error.error?.message || 'Unable to load rooms. Reload to retry.')
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
  refreshRooms() {
    this.api.groupRooms(this.group().id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rooms => this.rooms.set(rooms),
      error: () => this.rooms.set([])
    });
  }
  // DEMO: Adds, renames or deletes a room through the Group API.
  change(action: 'add' | 'rename' | 'delete', room = '') {
    const group = this.group();
    if (!group.isGroupAdmin || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.changeRoom(group.id, action, room, action === 'add' ? this.newName : this.renamed)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => {
          this.busy.set(false);
          if (this.group().id !== group.id) return;
          if (this.selected() === room) this.selected.set(action === 'delete' ? null : this.renamed.trim());
          this.rooms.set(result.chatRooms); this.editing = null; this.newName = ''; this.message.set('Rooms updated.');
        },
        error: error => { this.busy.set(false); this.error.set(error.error?.message || 'Unable to update rooms. Please retry.'); }
      });
  }
}
