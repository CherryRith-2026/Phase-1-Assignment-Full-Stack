import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';

const api = 'http://localhost:3000/api/';
// Only send the login token to our API, never to third-party URLs.
export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem('sessionToken');
  return next(token && request.url.startsWith(api)
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);
};

@Injectable({ providedIn: 'root' })
export class Session {
  private http = inject(HttpClient);
  private router = inject(Router);

  logout() {
    // Subscribe before clearing storage so the interceptor can attach the token.
    this.http.post(`${api}logout`, {}).subscribe({ error: () => {} });
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('currentUser');
    this.router.navigate(['/login']);
  }
}
