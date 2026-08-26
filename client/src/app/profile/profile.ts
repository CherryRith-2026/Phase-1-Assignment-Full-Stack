import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';

@Component({
  selector: 'app-profile', // The Angular Profile component

  imports: [RouterLink], // RouterLink helps navigate to other pages

  templateUrl: './profile.html', // URl helps this component connects to the profile HTML and CSS

  styleUrl: './profile.css',
})

export class Profile {

  // It stores the current logged-in user's information
  currentUser: any = null;

  constructor(private router: Router) {

    // Gets the logged-in user from local storage
    const storedUser = localStorage.getItem('currentUser');

    if (storedUser) {
      // Converts the stored JSON string back to user object
      this.currentUser = JSON.parse(storedUser);
    }
  }

  // Removes logged-in user information and returns to Login page
  logout() {
    localStorage.removeItem('currentUser');
    this.router.navigate(['/login']);
  }

}