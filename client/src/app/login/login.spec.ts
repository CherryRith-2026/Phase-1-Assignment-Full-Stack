import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Login } from './login';

describe('Login', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    TestBed.configureTestingModule({ imports: [Login], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting()
    ] });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.unstubAllGlobals(); });
  // DEMO: Checks that each login role keeps the server token and reaches the correct page.
  for (const role of ['user', 'groupAdmin', 'superAdmin']) {
    it(`preserves ${role} login and stores the server-issued session token`, () => {
      const component = TestBed.createComponent(Login).componentInstance;
      component.username = 'demo';
      component.password = 'secret';
      component.login();
      const request = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/login');
      expect(request.request.body).toEqual({ username: 'demo', password: 'secret' });
      request.flush({ success: true, token: 'a'.repeat(64), user: { id: 1, username: 'demo', role } });
      expect(localStorage.getItem('sessionToken')).toBe('a'.repeat(64));
      expect(JSON.parse(localStorage.getItem('currentUser')!).role).toBe(role);
      expect(localStorage.getItem('currentUser')).not.toContain('secret');
      expect(component.password).toBe('');
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([role === 'superAdmin' ? '/super-admin' : '/home']);
    });
  }
  it('rejects tokenless or malformed successful logins and clears stale identity', async () => {
    const fixture = TestBed.createComponent(Login);
    for (const token of [undefined, 'undefined', '', 'invalid-token']) {
      localStorage.setItem('currentUser', JSON.stringify({ id: 99 }));
      localStorage.setItem('sessionToken', 'old-token');
      fixture.componentInstance.login();
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/login')
        .flush({ success: true, user: { id: 1 }, token });
      await fixture.whenStable();
      expect(localStorage.getItem('currentUser')).toBeNull();
      expect(localStorage.getItem('sessionToken')).toBeNull();
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Restart the Fabulari backend');
    }
  });
  it('shows failed-login and network errors instead of navigating', async () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.login();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/login')
      .flush({ success: false, message: 'Invalid username or password' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Invalid username or password');
    fixture.componentInstance.login();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/login')
      .error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to reach');
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });

});
