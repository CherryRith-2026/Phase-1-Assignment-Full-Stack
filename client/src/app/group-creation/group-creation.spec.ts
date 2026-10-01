import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GroupCreation } from './group-creation';
const api = 'http://localhost:3000/api';
const pending = { id: 'abc', userId: 1, username: 'User1', name: 'group1', description: 'Test group', minimumAge: 15, colour: '#728fce', status: 'pending' as const };
describe('Group creation requests', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [GroupCreation], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  // DEMO: Checks submitting creates a pending request rather than calling direct group creation.
  it('submits only group information once and shows pending confirmation and history', async () => {
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/group-creation-requests`).flush([]);
    const component = fixture.componentInstance;
    Object.assign(component, { name: pending.name, description: pending.description, minimumAge: 15, colour: pending.colour });
    component.submit(); component.submit();
    const sent = http.expectOne(`${api}/group-creation-requests`);
    expect(sent.request.body).toEqual({ name: pending.name, description: pending.description, minimumAge: 15, colour: pending.colour });
    sent.flush({ message: 'Pending Super Admin approval.', request: pending });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Pending Super Admin approval.');
    expect(fixture.nativeElement.textContent).toContain('Status: pending');
    expect(fixture.nativeElement.textContent).not.toContain('Approve');
    http.expectNone(`${api}/groups`);
  });
  it('displays persisted approved/rejected requests and server validation errors', async () => {
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/group-creation-requests`).flush([{ ...pending, status: 'approved' }, { ...pending, id: 'def', status: 'rejected' }]);
    fixture.componentInstance.submit();
    http.expectOne(`${api}/group-creation-requests`).flush({ message: 'Already pending' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Already pending');
    expect(fixture.nativeElement.textContent).toContain('Status: rejected');
    expect(fixture.nativeElement.querySelector('article a').getAttribute('href')).toBe('/home');
    expect(fixture.componentInstance.busy()).toBe(false);
  });
  for (const action of ['approve', 'reject'] as const) {
    it(`shows requester details and sends ${action} without user identity`, async () => {
      vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/group-requests');
      const fixture = TestBed.createComponent(GroupCreation);
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${api}/admin/group-creation-requests`).flush([pending]);
      await fixture.whenStable();
      const text = fixture.nativeElement.textContent;
      for (const value of ['User1', 'group1', 'Test group', '15', '#728fce', 'pending']) expect(text).toContain(value);
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      expect(text).not.toContain('Cancel Request');
      fixture.componentInstance.resolve(pending, action); fixture.componentInstance.resolve(pending, action);
      const sent = http.expectOne(`${api}/admin/group-creation-requests/abc/${action}`);
      expect(sent.request.body).toEqual({});
      sent.flush({ message: `Request ${action} completed`, request: { ...pending, status: action === 'approve' ? 'approved' : 'rejected' } });
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('article')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain(`Request ${action} completed`);
    });
  }
  it('shows authorization errors on direct review navigation and supports retry', async () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/group-requests');
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/admin/group-creation-requests`).flush({ message: 'Super Admin access required.' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Super Admin access required.');
    fixture.componentInstance.load();
    http.expectOne(`${api}/admin/group-creation-requests`).flush([pending]);
    fixture.componentInstance.resolve(pending, 'approve');
    http.expectOne(`${api}/admin/group-creation-requests/abc/approve`).flush({ message: 'Already resolved' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Already resolved');
    expect(fixture.componentInstance.busy()).toBe(false);
  });
  it('only offers cancellation for own pending history and updates it immediately', async () => {
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/group-creation-requests`).flush([
      pending, ...['approved', 'rejected', 'cancelled', 'approving'].map(status => ({ ...pending, id: status, status }))
    ]);
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('article button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toContain('Cancel Request');
    buttons[0].click(); buttons[0].click();
    const sent = http.expectOne(`${api}/group-creation-requests/abc`);
    expect(sent.request.method).toBe('DELETE'); expect(sent.request.body).toBeNull();
    sent.flush({ message: 'Group creation request cancelled.', request: { ...pending, status: 'cancelled' } });
    await fixture.whenStable();
    expect(fixture.componentInstance.requests().some(item => item.id === pending.id)).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Status: cancelled');
    expect(fixture.nativeElement.querySelectorAll('article button').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Group creation request cancelled.');
  });
  it('keeps history on cancellation errors and reconciles a concurrent approval', async () => {
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/group-creation-requests`).flush([pending]);
    fixture.componentInstance.cancel(pending);
    http.expectOne(`${api}/group-creation-requests/abc`).flush({}, { status: 500, statusText: 'Error' });
    expect(fixture.componentInstance.requests()[0].status).toBe('pending');
    expect(fixture.componentInstance.busy()).toBe(false);
    fixture.componentInstance.cancel(pending);
    http.expectOne(`${api}/group-creation-requests/abc`).flush({ message: 'Only pending requests can be cancelled.', request: { ...pending, status: 'approved' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Only pending requests can be cancelled.');
    expect(fixture.nativeElement.querySelector('article button')).toBeNull();
    fixture.componentInstance.cancel(fixture.componentInstance.requests()[0]);
    http.expectNone(`${api}/group-creation-requests/abc`);
  });

  it('hides cancelled history immediately and after reopening while retaining approved Car', async () => {
    const http = TestBed.inject(HttpTestingController);
    const cancelled = { ...pending, status: 'cancelled' };
    // Mock data only: never connect to or modify the real Car request.
    const car = { ...pending, id: 'approved-car', name: 'Car', status: 'approved' };
    let fixture = TestBed.createComponent(GroupCreation);
    http.expectOne(`${api}/my/group-creation-requests`).flush([pending, car]);
    await fixture.whenStable();
    const originalCards = fixture.nativeElement.querySelectorAll('article');
    expect(originalCards[1].textContent).toContain('Car');
    expect(originalCards[1].querySelector('button')).toBeNull();
    originalCards[0].querySelector('button').click();
    http.expectOne(`${api}/group-creation-requests/abc`).flush({ message: 'Request cancelled.', request: cancelled });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('article').length).toBe(1);
    expect(fixture.nativeElement.querySelector('article').textContent).toContain('Car');
    http.expectNone(`${api}/my/group-creation-requests`);
    fixture.destroy();
    fixture = TestBed.createComponent(GroupCreation);
    http.expectOne(`${api}/my/group-creation-requests`).flush([cancelled, car]);
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('Car');
    expect(cards[0].textContent).toContain('Status: approved');
    expect(fixture.nativeElement.textContent).not.toContain('Status: cancelled');
    expect(fixture.nativeElement.querySelectorAll('article button').length).toBe(0);
  });

  it('removes a stale pending card when another tab already cancelled and shows the empty state', async () => {
    const fixture = TestBed.createComponent(GroupCreation);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/group-creation-requests`).flush([pending]);
    fixture.componentInstance.cancel(pending);
    http.expectOne(`${api}/group-creation-requests/abc`).flush({ message: 'Only pending requests can be cancelled.', request: { ...pending, status: 'cancelled' } }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('article')).toBeNull();
    fixture.componentInstance.load();
    http.expectOne(`${api}/my/group-creation-requests`).flush([{ ...pending, status: 'cancelled' }]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('article')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No requests to show.');
  });

});
