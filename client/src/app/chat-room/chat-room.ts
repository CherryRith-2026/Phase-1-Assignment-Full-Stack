import { GroupSettings } from '../group-settings/group-settings';
import { GroupMembers } from '../group-members/group-members';
import { LeaveGroup } from '../leave-group/leave-group';
import { Session } from '../shared/session';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-chat-room', // This is the Angular chat room component allowing users to communicate 
  imports: [RouterLink, LeaveGroup, GroupMembers, GroupSettings], // It navigates the page to another different page such has home, profile, login, and sign up
  templateUrl: './chat-room.html', // It connects the chat room with HTML and CSS for user friendly interface
  styleUrl: './chat-room.css',
})
export class ChatRoom {
  readonly session = inject(Session);

}