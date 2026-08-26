import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-home',  // The Angular Home component in the application after successful login 
  imports: [RouterLink],   // RouterLink help navigate to Profile and Chat-room pages
  templateUrl: './home.html', // This URL component will connect to the HTML and CSS to design the home page
  styleUrl: './home.css',
})
export class Home {
  constructor(
  private router: Router,
  private http: HttpClient
) {}

  // Removes the user that logged in to the page when they click logout 
  logout() {
    localStorage.removeItem('currentUser');

    // This will navigate or return the user back to the login page after they click logout 
    this.router.navigate(['/login']);
  }

  // This add the user that logged in to their selected group
joinGroup(groupId: number) {

  const storedUser = localStorage.getItem('currentUser');

  if (storedUser) {

    const user = JSON.parse(storedUser);

    this.http.post<any>(
      `http://localhost:3000/api/groups/${groupId}/members`,
      {
        username: user.username
      }
    ).subscribe(response => {

      if (response.success) {
        alert('Joined group successfully!');
      }

    });
  }
}

}