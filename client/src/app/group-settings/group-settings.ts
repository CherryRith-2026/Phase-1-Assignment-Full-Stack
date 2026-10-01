import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Group, GroupApi } from '../shared/group-api';
import { GroupRooms } from '../group-rooms/group-rooms';

@Component({ selector: 'app-group-settings', imports: [FormsModule, GroupRooms], templateUrl: './group-settings.html', styleUrl: './group-settings.css' })
export class GroupSettings {
  readonly groupId = input<number | null>(null);
  readonly saved = output<Group>();
  readonly group = signal<Group | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  name = ''; description = ''; colour = '#728fce'; minimumAge = 0;
  private api = inject(GroupApi);
  private destroyRef = inject(DestroyRef);
  constructor() {
    effect(onCleanup => {
      const id = this.groupId(); this.group.set(null); this.error.set(''); this.message.set('');
      if (id === null) return;
      const subscription = this.api.myGroups().subscribe({
        next: groups => {
          const group = groups.find(item => item.id === id);
          if (!group) { this.error.set('Group membership required.'); return; }
          this.group.set(group); this.name = group.name; this.description = group.description;
          this.colour = group.colour || '#728fce'; this.minimumAge = Number(group.minimumAge || 0);
        },
        error: error => this.error.set(error.error?.message || 'Unable to load group settings. Reload to retry.')
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
  // DEMO: Sends the four editable settings; Express checks group admin permission again.
  save() {
    const group = this.group();
    if (!group?.isGroupAdmin || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.updateGroup(group.id, { name: this.name, description: this.description, colour: this.colour, minimumAge: this.minimumAge })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => {
          this.busy.set(false);
          if (this.groupId() !== group.id) return;
          this.group.set(result.group); this.name = result.group.name; this.description = result.group.description;
          this.message.set('Group settings saved.'); this.saved.emit(result.group);
        },
        error: error => { this.busy.set(false); this.error.set(error.error?.message || 'Unable to save settings. Please retry.'); }
      });
  }
}
