import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { GroupPage, memberGroup } from './group-page';

@Component({ template: 'Access redirected' })
class RedirectPage {}

describe('Member group page', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [
    provideHttpClient(), provideHttpClientTesting(),
    provideRouter([
      { path: 'groups/:id', component: GroupPage, resolve: { group: memberGroup } },
      { path: 'home', component: RedirectPage }, { path: 'login', component: RedirectPage }
    ])
  ] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('opens the selected approved group with its creator badge and description', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/groups/42', GroupPage);
    await new Promise(resolve => setTimeout(resolve, 0));
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([
      { id: 42, name: 'Car', description: 'Cars model', isGroupAdmin: true }
    ]);
    await navigation;
    if (harness.routeNativeElement?.querySelector('app-group-settings')) {
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([{ id: 42, name: 'Car', description: 'Cars model', minimumAge: 0, isGroupAdmin: true }]);
      harness.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/42/rooms').flush([]);
    }
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/42/members')
      .flush({ canManage: true, members: [{ id: 1, username: 'Cherry', isGroupAdmin: true }] });
    TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/42/join-requests').flush([]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Group Members');
    expect(harness.routeNativeElement?.textContent).toContain('Car');
    expect(harness.routeNativeElement?.textContent).toContain('Cars model');
    expect(harness.routeNativeElement?.textContent).toContain('Group Admin');
  });
  it('allows promotion after sole-admin refusal, then returns Home when the original admin leaves', async () => {
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl('/groups/42', GroupPage);
    await new Promise(resolve => setTimeout(resolve, 0));
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:3000/api/my/groups').flush([{ id: 42, name: 'Car', isGroupAdmin: true }]);
    await navigation;
    if (harness.routeNativeElement?.querySelector('app-group-settings')) {
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([{ id: 42, name: 'Car', description: 'Cars model', minimumAge: 0, isGroupAdmin: true }]);
      harness.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/42/rooms').flush([]);
    }
    http.expectOne('http://localhost:3000/api/groups/42/members').flush({ canManage: true, members: [
      { id: 1, username: 'Cherry', isGroupAdmin: true }, { id: 2, username: 'James', isGroupAdmin: false }
    ] });
    http.expectOne('http://localhost:3000/api/groups/42/join-requests').flush([]);
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('main')!.firstElementChild!.tagName.toLowerCase()).toBe('app-leave-group');
    const leave = harness.routeNativeElement!.querySelector('app-leave-group button') as HTMLButtonElement;
    leave.click();
    http.expectOne('http://localhost:3000/api/groups/42/members/me').flush({ message: 'Assign another Group Admin before leaving this group.' }, { status: 409, statusText: 'Conflict' });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Assign another Group Admin');
    (harness.routeNativeElement!.querySelector('app-group-members .group-members button') as HTMLButtonElement).click();
    http.expectOne('http://localhost:3000/api/groups/42/admins/2').flush({ message: 'Member is now a Group Admin.', member: { id: 2, username: 'James', isGroupAdmin: true } });
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('app-group-members .group-members button')).toBeNull();
    leave.click();
    http.expectOne('http://localhost:3000/api/groups/42/members/me').flush({ success: true });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Access redirected');
  });
  for (const unauthorized of [false, true]) {
    it(`redirects ${unauthorized ? 'unauthenticated visitors' : 'nonmembers'} instead of opening a group`, async () => {
      const harness = await RouterTestingHarness.create();
      const navigation = harness.navigateByUrl('/groups/42', RedirectPage);
      await new Promise(resolve => setTimeout(resolve, 0));
      const request = TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups');
      if (unauthorized) request.flush({}, { status: 401, statusText: 'Unauthorized' });
      else request.flush([]);
      await navigation;
    if (harness.routeNativeElement?.querySelector('app-group-settings')) {
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/my/groups').flush([{ id: 42, name: 'Car', description: 'Cars model', minimumAge: 0, isGroupAdmin: true }]);
      harness.detectChanges();
      TestBed.inject(HttpTestingController).expectOne('http://localhost:3000/api/groups/42/rooms').flush([]);
    }
      expect(harness.routeNativeElement?.textContent).toContain('Access redirected');
    });
  }
});
