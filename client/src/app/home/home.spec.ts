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
      { id: 1, name: 'Study', description: 'My study group', isGroupAdmin: true, colour: '#728fce' }
    ]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('My Groups');
    expect(fixture.nativeElement.textContent).toContain('Study');
    expect(fixture.nativeElement.textContent).toContain('Group Admin');
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

describe('Approved group entry', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [Home], providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()]
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  for (const isGroupAdmin of [true, false]) {
    it(`lets an approved group's ${isGroupAdmin ? 'creator retain the Group Admin badge and' : 'regular member'} enter`, async () => {
      const fixture = TestBed.createComponent(Home);
      const http = TestBed.inject(HttpTestingController);
      const car = { id: 42, name: 'Car', description: 'Cars model', isGroupAdmin };
      http.expectOne('http://localhost:3000/api/my/groups').flush([car]);
      await fixture.whenStable();
      const card = fixture.nativeElement.querySelector('.my-group-card');
      expect(card.textContent).toContain('Car');
      expect(card.textContent).toContain('Cars model');
      expect(card.textContent.includes('Group Admin')).toBe(isGroupAdmin);
      const enter = card.querySelector('a');
      expect(enter.textContent).toBe('Enter');
      expect(enter.getAttribute('href')).toBe('/groups/42');
      enter.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      http.expectOne('http://localhost:3000/api/my/groups').flush([car]);
      await fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/groups/42');
      expect(card.textContent.includes('Group Admin')).toBe(isGroupAdmin);
    });
  }
});
