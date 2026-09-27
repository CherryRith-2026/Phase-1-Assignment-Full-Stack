import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Home } from './home';
import { BrowseGroups } from '../browse-groups/browse-groups';
import { routes } from '../app.routes';

describe('Home groups', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [Home], providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()]
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads and displays only My Groups from the membership API', async () => {
    const fixture = TestBed.createComponent(Home);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:3000/api/my/groups').flush([
      { id: 1, name: 'Study', description: 'My study group' }
    ]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('My Groups');
    expect(fixture.nativeElement.textContent).toContain('Study');
    expect(fixture.nativeElement.textContent).not.toContain('Music');
    expect(fixture.nativeElement.textContent).not.toContain('Request to Join');
    http.expectNone('http://localhost:3000/api/groups/available');
  });
  it('Browse Available Groups navigates to a separate route', async () => {
    const fixture = TestBed.createComponent(Home);
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([]);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a.browse-link') as HTMLAnchorElement;
    expect(link.textContent).toContain('Browse Available Groups');
    link.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/browse-groups');
    expect(routes.find(route => route.path === 'browse-groups')?.component).toBe(BrowseGroups);
  });
  it('shows empty membership and load-error states', async () => {
    const fixture = TestBed.createComponent(Home);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:3000/api/my/groups').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('You have not joined any groups yet');
    fixture.componentInstance.loadGroups();
    http.expectOne('http://localhost:3000/api/my/groups').flush({ message: 'Please log in again' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Please log in again');
  });
});
