import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { sessionInterceptor, Session } from './session';

export function mockStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key), clear: () => storage.clear()
  });
}
describe('Login session', () => {
  beforeEach(() => {
    mockStorage();
    localStorage.setItem('sessionToken', 'test-token');
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'login', children: [] }]),
      provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()
    ] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.unstubAllGlobals(); });
  // DEMO: Checks tokens reach only our API, protecting them from third-party requests.
  it('attaches the token to Home, Browse and Profile requests but never third-party requests', () => {
    const http = TestBed.inject(HttpClient);
    const controller = TestBed.inject(HttpTestingController);
    for (const path of ['my/groups', 'groups/available', 'users/1']) {
      http.get(`http://localhost:3000/api/${path}`).subscribe();
      const own = controller.expectOne(`http://localhost:3000/api/${path}`);
      expect(own.request.headers.get('Authorization')).toBe('Bearer test-token');
      own.flush([]);
    }
    http.put('http://localhost:3000/api/users/1', { firstName: 'Cherry' }).subscribe();
    const save = controller.expectOne('http://localhost:3000/api/users/1');
    expect(save.request.headers.get('Authorization')).toBe('Bearer test-token');
    save.flush({ success: true });
    http.get('https://example.com/data').subscribe();
    const other = controller.expectOne('https://example.com/data');
    expect(other.request.headers.has('Authorization')).toBe(false);
    other.flush([]);
  });
  // DEMO: Checks logout clears browser identity and calls the server to revoke the session.
  it('revokes the session on logout and clears browser login state', () => {
    localStorage.setItem('currentUser', '{}');
    TestBed.inject(Session).logout();
    const request = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/logout');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({ success: true });
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(localStorage.getItem('sessionToken')).toBeNull();
  });
});
