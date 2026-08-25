import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Signup } from './signup/signup';
import { Home } from './home/home';
import { Profile } from './profile/profile';
import { ChatRoom } from './chat-room/chat-room';
import { MusicChat } from './music-chat/music-chat';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'home', component: Home },
  { path: 'profile', component: Profile },
  { path: 'chat-room', component: ChatRoom },
  { path: 'music-chat', component: MusicChat },
];