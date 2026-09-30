import { GroupSettings } from '../group-settings/group-settings';
import { GroupMembers } from '../group-members/group-members';
import { LeaveGroup } from '../leave-group/leave-group';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RedirectCommand, ResolveFn, Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { Group, GroupApi } from '../shared/group-api';
import { Session } from '../shared/session';

// Resolve only groups returned by the existing session-owned membership API.
export const memberGroup: ResolveFn<Group> = route => {
  const router = inject(Router);
  return inject(GroupApi).myGroups().pipe(
    map(groups => groups.find(group => group.id === Number(route.paramMap.get('id')))
      ?? new RedirectCommand(router.parseUrl('/home'))),
    catchError(error => of(new RedirectCommand(router.parseUrl(error.status === 401 ? '/login' : '/home'))))
  );
};

@Component({
  selector: 'app-group-page', imports: [RouterLink, LeaveGroup, GroupMembers, GroupSettings],
  templateUrl: './group-page.html', styleUrls: ['../home/home.css']
})
export class GroupPage {
  readonly route = inject(ActivatedRoute);
  readonly session = inject(Session);
  updatedGroup: Group | null = null;
  get group(): Group { return this.updatedGroup ?? this.route.snapshot.data['group']; }
}
