import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-signup',

  imports: [RouterLink, FormsModule], // FormsModule allows ngModel to connect the form inputs to typescript variables 

  templateUrl: './signup.html',
  styleUrl: './signup.css',
})

export class Signup {

  username = '';
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  dob = '';

  constructor(
    private http: HttpClient, // It communicates with Noe/Express server to send new user's info to the server and receive the response back
    private router: Router    // Navigates to every Angular pages
  ) {}

  signup() {

    // POST sends the new user's information to the server
    this.http.post<any>('http://localhost:3000/api/users', {
      username: this.username,
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      password: this.password,
      dob: this.dob
    }).subscribe(response => {

      // After successful signup, it will take you to Login page
      if (response.success) {
        this.router.navigate(['/login']);
      }

    });
  }

}