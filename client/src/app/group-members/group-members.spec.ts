import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GroupMembers } from './group-members';
const api = 'http://localhost:3000/api/groups/42';
const admin = { id: 1, username: 'Cherry', isGroupAdmin: true };
const member = { id: 2, username: 'James', isGroupAdmin: false };
describe('Group Members', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [GroupMembers], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  async function setup(canManage: boolean) {
    const fixture = TestBed.createComponent(GroupMembers);
    fixture.componentRef.setInput('groupId', 42);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${api}/members`).flush({ canManage, members: [admin, member] });
    if (canManage) TestBed.inject(HttpTestingController).expectOne(`${api}/join-requests`).flush([]);
    await fixture.whenStable();
    return fixture;
  }
  it('shows member roles and promotes once using group/member IDs, with no actor or global role supplied', async () => {
    const fixture = await setup(true);
    expect(fixture.nativeElement.textContent).toContain('Group Members');
    const rows = fixture.nativeElement.querySelectorAll('li');
    expect(rows[0].textContent).toContain('Cherry'); expect(rows[0].textContent).toContain('Group Admin');
    expect(rows[0].querySelector('button')).toBeNull();
    expect(rows[1].textContent).toContain('James'); expect(rows[1].textContent).toContain('Member');
    const button = rows[1].querySelector('button');
    expect(button.textContent).toContain('Make Group Admin');
    button.click(); button.click();
    const sent = TestBed.inject(HttpTestingController).expectOne(`${api}/admins/2`);
    expect(sent.request.method).toBe('POST'); expect(sent.request.body).toEqual({});
    sent.flush({ message: 'Member is now a Group Admin.', member: { ...member, isGroupAdmin: true } });
    await fixture.whenStable();
    expect(rows[1].textContent).toContain('Group Admin');
    expect(rows[1].querySelector('button')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Member is now a Group Admin.');
    fixture.componentInstance.promote(fixture.componentInstance.members()[1]);
    TestBed.inject(HttpTestingController).expectNone(`${api}/admins/2`);
  });
  it('does not allow regular members to initiate promotion', async () => {
    const fixture = await setup(false);
    expect(fixture.nativeElement.querySelector('.group-members button')).toBeNull();
    fixture.componentInstance.promote(member);
    TestBed.inject(HttpTestingController).expectNone(`${api}/admins/2`);
  });
  for (const status of [401, 403, 409, 500]) {
    it(`shows server rejection ${status} without changing the displayed member role`, async () => {
      const fixture = await setup(true);
      fixture.componentInstance.promote(member);
      TestBed.inject(HttpTestingController).expectOne(`${api}/admins/2`).flush({ message: 'Promotion denied' }, { status, statusText: 'Error' });
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('Promotion denied');
      expect(fixture.componentInstance.members()[1].isGroupAdmin).toBe(false);
      expect(fixture.componentInstance.promoting()).toBeNull();
      if (status === 401 || status === 403) expect(fixture.nativeElement.querySelector('.group-members button')).toBeNull();
    });
  }
  it('handles member-list authorization errors and never offers management', async () => {
    const fixture = TestBed.createComponent(GroupMembers);
    fixture.componentRef.setInput('groupId', 42); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${api}/members`).flush({ message: 'You are not a member.' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('You are not a member.');
    expect(fixture.nativeElement.querySelector('.group-members button')).toBeNull();
  });
  const pending = { id: 'request1', userId: 3, username: 'New user', firstName: 'Alex', lastName: 'Smith', age: 20, status: 'pending' as const };
  it('shows identifying details, approves once, refreshes members and supports promotion of the new member', async () => {
    const fixture = await setup(true);
    fixture.componentInstance.loadRequests();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/join-requests`).flush([pending]);
    await fixture.whenStable();
    const section = fixture.nativeElement.querySelector('.join-requests');
    for (const text of ['Join Requests', 'New user', 'Alex', 'Smith', 'Age: 20']) expect(section.textContent).toContain(text);
    const approve = section.querySelector('li button');
    expect(approve.getAttribute('aria-label')).toBe('Approve request');
    expect(approve.classList.contains('fab-success')).toBe(true);
    const reject = section.querySelector('[aria-label="Reject request"]');
    expect(reject.classList.contains('fab-danger')).toBe(true);
    expect(reject.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(section.querySelector('[aria-label="Refresh requests"]').title).toBe('Refresh requests');
    approve.click(); approve.click();
    const sent = http.expectOne(`${api}/join-requests/request1/approve`);
    expect(sent.request.body).toEqual({}); expect(sent.request.method).toBe('POST');
    sent.flush({ message: 'Approved', status: 'approved' });
    http.expectOne(`${api}/members`).flush({ canManage: true, members: [admin, member, { id: 3, username: 'New user', isGroupAdmin: false }] });
    await fixture.whenStable();
    expect(section.querySelector('li')).toBeNull();
    const row = fixture.nativeElement.querySelectorAll('.group-members li')[2];
    expect(row.textContent).toContain('Member');
    row.querySelector('button').click();
    http.expectOne(`${api}/admins/3`).flush({ message: 'Promoted', member: { id: 3, username: 'New user', isGroupAdmin: true } });
    await fixture.whenStable(); expect(row.textContent).toContain('Group Admin');
  });
  it('rejects without refreshing or changing members and handles processing errors', async () => {
    const fixture = await setup(true);
    const http = TestBed.inject(HttpTestingController);
    fixture.componentInstance.loadRequests(); http.expectOne(`${api}/join-requests`).flush([{ ...pending, age: null }]);
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Age: Not available');
    fixture.componentInstance.review(pending, 'reject');
    http.expectOne(`${api}/join-requests/request1/reject`).flush({ message: 'Rejected', status: 'rejected' });
    http.expectNone(`${api}/members`);
    expect(fixture.componentInstance.members().length).toBe(2);
    fixture.componentInstance.review(pending, 'approve');
    http.expectOne(`${api}/join-requests/request1/approve`).flush({ message: 'Request already processed' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Request already processed');
    expect(fixture.componentInstance.reviewing()).toBe(false);
  });
  it('hides join management for regular members and supports loading retry', async () => {
    const fixture = await setup(false);
    expect(fixture.nativeElement.querySelector('.join-requests')).toBeNull();
    fixture.componentInstance.review(pending, 'approve');
    TestBed.inject(HttpTestingController).expectNone(`${api}/join-requests/request1/approve`);
    fixture.componentInstance.canManage.set(true);
    fixture.componentInstance.loadRequests();
    TestBed.inject(HttpTestingController).expectOne(`${api}/join-requests`).flush({ message: 'Access denied' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Access denied');
    fixture.componentInstance.loadRequests(); TestBed.inject(HttpTestingController).expectOne(`${api}/join-requests`).flush([]);
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('No pending join requests.');
  });

});
