import { Component, input, ViewEncapsulation } from '@angular/core';

type ActionIconName = 'join' | 'pending' | 'member' | 'edit' | 'delete' | 'add' | 'refresh' | 'approve' | 'cancel' | 'leave';

// Small local SVG set: buttons retain their own accessible names and handlers.
@Component({
  selector: 'app-action-icon',
  template: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path [attr.d]="paths[name()]" /></svg>`,
  styleUrl: './action-icon.css',
  encapsulation: ViewEncapsulation.None
})
export class ActionIcon {
  readonly name = input.required<ActionIconName>();
  readonly paths: Record<ActionIconName, string> = {
    join: 'M14 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M19 8v6 M16 11h6',
    pending: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2',
    member: 'M14 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M16 11l2 2 4-4',
    edit: 'M16 3l5 5 M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15z',
    delete: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    add: 'M12 5v14 M5 12h14',
    refresh: 'M20 7a9 9 0 1 0 1 9 M20 2v6h-6',
    approve: 'M5 12l4 4L20 5',
    cancel: 'M6 6l12 12 M18 6L6 18',
    leave: 'M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5'
  };
}
