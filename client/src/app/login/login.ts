import { Component } from '@angular/core';
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
  errorMessage = '';

  constructor(
    private http: HttpClient, //HttpClient is used to send HTTP requests to server and receieve responses from server, it also coomunicate with Node/Express server.
    private router: Router //Route used to navigate between different pages of the angular in application.
  ) {}

  login() {

    // POST sends username and password to login API
    this.http.post<any>('http://localhost:3000/api/login', {
      username: this.username,
      password: this.password
    }).subscribe(response => { 

  if (response.success) {
  // Help to save the logged-in user in the browser
  localStorage.setItem('currentUser', JSON.stringify(response.user));

  this.router.navigate(['/home']);
} else {
        this.errorMessage = response.message; 
        // If login fails, error will display error message from the server.
      }

    });

  }

}