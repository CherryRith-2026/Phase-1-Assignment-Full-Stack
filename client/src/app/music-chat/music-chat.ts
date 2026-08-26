import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-music-chat', //This define an angular music chat allow users to communicate about music 
  imports: [RouterLink], // navgigates to another page: home, sign up, login, profile, and chat room
  templateUrl: './music-chat.html', // Connects the music chat with HTML and CSS 
  styleUrl: './music-chat.css',
})
export class MusicChat {

}