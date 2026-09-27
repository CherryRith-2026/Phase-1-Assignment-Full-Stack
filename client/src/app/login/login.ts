import { Component, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})

export class Login {   // It helps store the username and password entered by users in login form

  username = '';
  password = '';
  readonly errorMessage = signal('');

  constructor(
    private http: HttpClient, //HttpClient is used to send HTTP requests to server and receieve responses from server, it also coomunicate with Node/Express server.
    private router: Router //Route used to navigate between different pages of the angular in application.
  ) {}

  login() {
    this.errorMessage.set('');
    // A new login must not keep a previous user's cached identity or token.
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');

    this.http.post<any>('http://localhost:3000/api/login', {
      username: this.username,
      password: this.password
    }).subscribe({
      next: response => {
        if (!response.success) {
          this.errorMessage.set(response.message || 'Invalid username or password');
          return;
        }
        // An outdated backend can return success without creating a session.
        // Stay on Login instead of storing "undefined" and showing a false login.
        if (typeof response.token !== 'string' || !/^[a-f0-9]{64}$/.test(response.token)) {
          this.errorMessage.set('Login did not create a session. Restart the Fabulari backend and log in again.');
          return;
        }
        this.password = '';
        localStorage.setItem('currentUser', JSON.stringify(response.user));
        localStorage.setItem('sessionToken', response.token);
        this.router.navigate(['/home']);
      },
      error: () => {
        this.errorMessage.set('Unable to reach the login service. Check the backend and try again.');
      }
    });
  }
}
