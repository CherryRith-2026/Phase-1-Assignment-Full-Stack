import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { SuperAdmin } from './super-admin';
import { superAdminGuard } from './super-admin.guard';
import { sessionInterceptor } from '../shared/session';
import { routes } from '../app.routes';

const endpoint = 'http://localhost:3000/api/admin/group-creation-requests';
describe('Super Admin dashboard', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    });
    TestBed.configureTestingModule({ imports: [SuperAdmin], providers: [
      provideRouter(routes), provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()
    ] });
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.unstubAllGlobals(); });

  it('shows pending count, review/profile links and no normal Home sections', async () => {
    localStorage.setItem('sessionToken', 'a'.repeat(64));
    const fixture = TestBed.createComponent(SuperAdmin);
    const request = TestBed.inject(HttpTestingController).expectOne(endpoint);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${'a'.repeat(64)}`);
    expect(request.request.method).toBe('GET');
    request.flush([{ status: 'pending', name: 'Car' }, { status: 'pending' }, { status: 'approving' }]);
    await fixture.whenStable();
    const element = fixture.nativeElement;
    expect(element.querySelector('h1').textContent).toBe('Super Admin Dashboard');
    expect(element.textContent).toContain('Pending group creation requests: 2');
    expect(element.querySelector('a[href="/group-requests"]')).not.toBeNull();
    expect(element.querySelector('a[href="/profile"]')).not.toBeNull();
    for (const label of ['My Groups', 'Browse Available Groups', 'Request a New Group']) expect(element.textContent).not.toContain(label);
  });
  it('handles errors without showing a false zero and refreshes the count', async () => {
    const fixture = TestBed.createComponent(SuperAdmin);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endpoint).flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Unable to load pending requests');
    expect(fixture.componentInstance.pendingCount()).toBeNull();
    fixture.nativeElement.querySelector('button').click();
    http.expectOne(endpoint).flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Pending group creation requests: 0');
  });
  it('uses existing logout to revoke the token and clear the cached user', async () => {
    localStorage.setItem('sessionToken', 'a'.repeat(64));
    localStorage.setItem('currentUser', '{"role":"superAdmin"}');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SuperAdmin);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(endpoint).flush([]);
    await fixture.whenStable();
    fixture.nativeElement.querySelector('a[href="#"]').click();
    const logout = http.expectOne('http://localhost:3000/api/logout');
    expect(logout.request.headers.get('Authorization')).toBe(`Bearer ${'a'.repeat(64)}`);
    logout.flush({ success: true });
    expect(localStorage.getItem('sessionToken')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
  it('wires a server-verified guard to the dashboard route and allows authorized sessions', async () => {
    expect(routes.find(route => route.path === 'super-admin')?.canActivate).toContain(superAdminGuard);
    const result = firstValueFrom(TestBed.runInInjectionContext(() =>
      superAdminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Observable<boolean | UrlTree>);
    TestBed.inject(HttpTestingController).expectOne(endpoint).flush([]);
    expect(await result).toBe(true);
  });
  for (const [status, target] of [[403, '/home'], [401, '/login'], [500, '/login']] as const) {
    it(`blocks direct dashboard access on HTTP ${status}, even with a forged cached admin role`, async () => {
      localStorage.setItem('currentUser', '{"role":"superAdmin"}');
      const result = firstValueFrom(TestBed.runInInjectionContext(() =>
        superAdminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) as Observable<boolean | UrlTree>);
      TestBed.inject(HttpTestingController).expectOne(endpoint).flush({}, { status, statusText: 'Denied' });
      expect(TestBed.inject(Router).serializeUrl(await result as UrlTree)).toBe(target);
    });
  }
});
