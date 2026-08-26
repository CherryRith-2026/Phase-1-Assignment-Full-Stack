import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { Home } from './home/home';
import { Profile } from './profile/profile';
import { ChatRoom } from './chat-room/chat-room';
import { MusicChat } from './music-chat/music-chat';

export const routes: Routes = [ // Routes are for navigation for the Angular components 
  { path: '', redirectTo: 'login', pathMatch: 'full' }, // It redirects the users to the login page

  // Every path of each component connects to the URL of the Angular 
  { path: 'login', component: Login }, 
  { path: 'signup', component: Signup },
  { path: 'home', component: Home },
  { path: 'profile', component: Profile },
  { path: 'chat-room', component: ChatRoom },
  { path: 'music-chat', component: MusicChat },
];