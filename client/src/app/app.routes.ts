import { GroupPage, memberGroup } from './group-page/group-page';
import { SuperAdmin } from './super-admin/super-admin';
import { superAdminGuard } from './super-admin/super-admin.guard';
import { GroupCreation } from './group-creation/group-creation';
import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { BrowseGroups } from './browse-groups/browse-groups';
import { Home } from './home/home';
import { Profile } from './profile/profile';
import { ChatRoom } from './chat-room/chat-room';
import { MusicChat } from './music-chat/music-chat';
import { AuditLogs } from './audit-logs/audit-logs';

export const routes: Routes = [ // Routes are for navigation for the Angular components 
  { path: '', redirectTo: 'login', pathMatch: 'full' }, // It redirects the users to the login page

  // Every path of each component connects to the URL of the Angular 
  { path: 'login', component: Login }, 
  { path: 'signup', component: Signup },
  { path: 'super-admin', component: SuperAdmin, canActivate: [superAdminGuard] },
  { path: 'super-admin', component: SuperAdmin, canActivate: [superAdminGuard] },
  { path: 'audit-logs', component: AuditLogs, canActivate: [superAdminGuard] },
  { path: 'groups/:id', component: GroupPage, resolve: { group: memberGroup } },
  { path: 'home', component: Home },
  { path: 'browse-groups', component: BrowseGroups },
  { path: 'request-group', component: GroupCreation },
  { path: 'group-requests', component: GroupCreation },
  { path: 'profile', component: Profile },
  { path: 'chat-room', component: ChatRoom },
  { path: 'music-chat', component: MusicChat },
];