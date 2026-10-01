import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BrowseGroups } from './browse-groups';

const api = 'http://localhost:3000/api/groups';
const available = { id: 1, name: 'From MongoDB', description: 'A real API group', minimumAge: 18, joinState: 'available', eligibilityMessage: '' };

describe('Browse groups', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [BrowseGroups], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads API groups and displays available, pending, member and age-restricted states', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    TestBed.inject(HttpTestingController).expectOne(`${api}/available`).flush([
      available,
      { ...available, id: 2, joinState: 'pending' },
      { ...available, id: 3, joinState: 'member' },
      { ...available, id: 4, joinState: 'ineligible', eligibilityMessage: 'You must be at least 18 years old.' }
    ]);
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards.length).toBe(4);
    const join = cards[0];
    expect(join.getAttribute('role')).toBe('button');
    expect(join.getAttribute('tabindex')).toBe('0');
    expect(join.getAttribute('title')).toBe('Request to join From MongoDB');
    expect(join.querySelector('app-action-icon')).toBeNull();
    const pendingIcon = cards[1].querySelector('[aria-label="Join request pending"]');
    expect(pendingIcon.getAttribute('role')).toBe('img');
    expect(pendingIcon.classList.contains('pending-status')).toBe(true);
    expect(pendingIcon.querySelector('app-action-icon').getAttribute('name')).toBe('pending');
    const memberIcon = cards[2].querySelector('[aria-label="You are a member of this group"]');
    expect(memberIcon.getAttribute('role')).toBe('img');
    expect(memberIcon.classList.contains('fab-success')).toBe(true);
    expect(memberIcon.querySelector('app-action-icon').getAttribute('name')).toBe('member');
    expect(cards[0].textContent).toContain('From MongoDB');
    expect(cards[0].textContent).toContain('A real API group');
    expect(cards[0].textContent).toContain('18');
    expect(cards[0].getAttribute('aria-label')).toBe('Request to join From MongoDB');
    expect(cards[1].getAttribute('role')).toBeNull();
    expect(cards[1].textContent).toContain('Pending');
    expect(cards[2].textContent).toContain('Already a member');
    expect(cards[2].querySelector('button')).toBeNull();
    expect(cards[3].textContent).toContain('at least 18');
    expect(cards[3].querySelector('button')).toBeNull();
  });
  // DEMO: Expects a pending request, not immediate membership, even after repeated clicks.
  it('sends an identity-free request, prevents double clicks and persists Pending after a fresh load', async () => {
    let fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([available]);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('article') as HTMLElement;
    button.click();
    button.click();
    const request = http.expectOne(`${api}/1/join-requests`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, joinState: 'pending', message: 'Pending Group Admin approval.' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('article').getAttribute('role')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Pending');
    fixture.destroy();
    fixture = TestBed.createComponent(BrowseGroups);
    http.expectOne(`${api}/available`).flush([{ ...available, joinState: 'pending' }]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Pending');
    http.expectNone(`${api}/1/members`);
  });
  it('shows backend age rejection and updates stale eligibility', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([available]);
    fixture.componentInstance.requestToJoin(fixture.componentInstance.groups()[0]);
    http.expectOne(`${api}/1/join-requests`).flush({ joinState: 'ineligible', message: 'You must be at least 18 years old.' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('at least 18');
    expect(fixture.nativeElement.querySelector('article button')).toBeNull();
  });
  it('handles duplicate-request responses as Pending', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([available]);
    fixture.componentInstance.requestToJoin(fixture.componentInstance.groups()[0]);
    http.expectOne(`${api}/1/join-requests`).flush({ joinState: 'pending', message: 'Already pending.' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.card-status').textContent).toContain('Pending');
  });
  it('shows load errors and lets the user retry', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Unable to load groups');
    fixture.componentInstance.loadGroups();
    http.expectOne(`${api}/available`).flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No groups are available yet');
  });
  // DEMO: Checks cancellation restores the join option without changing membership.
  it('cancels a pending request once and immediately restores Request to Join', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([{ ...available, joinState: 'pending' }]);
    await fixture.whenStable();
    const buttons = fixture.nativeElement.querySelectorAll('article button');
    expect(fixture.nativeElement.querySelector('.card-status').textContent).toContain('Pending');
    expect(buttons[0].textContent).toContain('Cancel Request');
    expect(buttons[0].getAttribute('aria-label')).toBe('Cancel join request');
    expect(buttons[0].title).toBe('Cancel join request');
    expect(buttons[0].parentElement.classList.contains('request-actions')).toBe(true);
    expect(buttons[0].parentElement.querySelector('.pending-status')).not.toBeNull();
    const cardClick = vi.fn();
    fixture.nativeElement.querySelector('article').addEventListener('click', cardClick);
    const join = vi.spyOn(fixture.componentInstance, 'requestToJoin');
    buttons[0].click();
    buttons[0].click();
    expect(cardClick).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    const request = http.expectOne(`${api}/1/join-requests`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Cancelling');
    request.flush({ success: true, joinState: 'available', eligibilityMessage: '', message: 'Request cancelled.' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('article').getAttribute('role')).toBe('button');
    expect(fixture.nativeElement.textContent).not.toContain('Cancel Request');
    expect(fixture.nativeElement.textContent).toContain('Request cancelled.');
    http.expectNone(`${api}/available`);
  });
  it('shows no-pending-request errors and reconciles a stale Pending card', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([{ ...available, joinState: 'pending' }]);
    fixture.componentInstance.cancelRequest(fixture.componentInstance.groups()[0]);
    http.expectOne(`${api}/1/join-requests`).flush({ joinState: 'available', message: 'No pending request exists for you in this group.' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No pending request');
    expect(fixture.nativeElement.querySelector('article').getAttribute('role')).toBe('button');
    expect(fixture.componentInstance.cancelling()).toEqual([]);
  });
  it('keeps Pending on cancellation failure and does not cancel member requests', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/available`).flush([{ ...available, joinState: 'pending' }, { ...available, id: 2, joinState: 'member' }]);
    fixture.componentInstance.cancelRequest(fixture.componentInstance.groups()[1]);
    http.expectNone(`${api}/2/join-requests`);
    fixture.componentInstance.cancelRequest(fixture.componentInstance.groups()[0]);
    http.expectOne(`${api}/1/join-requests`).flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards[0].textContent).toContain('Pending');
    expect(cards[0].querySelectorAll('button')[0].disabled).toBe(false);
    expect(cards[1].textContent).not.toContain('Cancel Request');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Unable to cancel');
  });

  for (const minimumAge of [16, 18]) {
    it(`uses server eligibility below and exactly at minimum age ${minimumAge}`, async () => {
      const fixture = TestBed.createComponent(BrowseGroups);
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${api}/available`).flush([
        { ...available, id: 1, minimumAge, joinState: 'ineligible', eligibilityMessage: `You must be at least ${minimumAge} years old to request to join this group.` },
        { ...available, id: 2, minimumAge, joinState: 'available' }
      ]);
      await fixture.whenStable();
      const cards = fixture.nativeElement.querySelectorAll('article');
      expect(cards[0].textContent).toContain(`Minimum age: ${minimumAge}`);
      expect(cards[0].textContent).toContain(`at least ${minimumAge}`);
      expect(cards[0].querySelector('button')).toBeNull();
      expect(cards[1].textContent).toContain(`Minimum age: ${minimumAge}`);
      cards[1].click();
      const request = http.expectOne(`${api}/2/join-requests`);
      expect(request.request.body).toEqual({});
      request.flush({ success: true, joinState: 'pending', message: 'Pending approval.' });
      await fixture.whenStable();
      expect(cards[1].textContent).toContain('Pending');
      expect(cards[1].textContent).toContain('Cancel Request');
    });
  }
  it('keeps an underage pending request cancellable then shows server ineligibility immediately', async () => {
    const fixture = TestBed.createComponent(BrowseGroups);
    const http = TestBed.inject(HttpTestingController);
    const reason = 'You must be at least 18 years old to request to join this group.';
    http.expectOne(`${api}/available`).flush([
      { ...available, joinState: 'pending', eligibilityMessage: reason },
      { ...available, id: 2, joinState: 'member', eligibilityMessage: reason }
    ]);
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards[0].textContent).toContain('Pending');
    expect(cards[1].textContent).toContain('Already a member');
    expect(cards[1].querySelector('button')).toBeNull();
    cards[0].querySelectorAll('button')[0].click();
    http.expectOne(`${api}/1/join-requests`).flush({ success: true, joinState: 'ineligible', eligibilityMessage: reason, message: 'Request cancelled.' });
    await fixture.whenStable();
    expect(cards[0].textContent).toContain(reason);
    expect(cards[0].querySelector('button')).toBeNull();
    http.expectNone(`${api}/available`);
  });

  for (const key of ['Enter', ' ']) {
    it(`supports ${key === ' ' ? 'Space' : key} and prevents requests on pending/member/ineligible cards`, async () => {
      const fixture = TestBed.createComponent(BrowseGroups);
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${api}/available`).flush([
        available, ...['pending', 'member', 'ineligible'].map((joinState, i) => ({...available, id: i + 2, joinState}))
      ]);
      await fixture.whenStable();
      const cards = fixture.nativeElement.querySelectorAll('article');
      for (let i = 1; i < cards.length; i++) {
        cards[i].click();
        cards[i].dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
        expect(cards[i].getAttribute('tabindex')).toBeNull();
        http.expectNone(`${api}/${i + 1}/join-requests`);
      }
      cards[0].dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
      cards[0].click();
      const sent = http.expectOne(`${api}/1/join-requests`);
      await fixture.whenStable();
      expect(cards[0].getAttribute('aria-disabled')).toBe('true');
      sent.flush({joinState: 'pending', message: 'Request pending.'});
      await fixture.whenStable();
      cards[0].click(); http.expectNone(`${api}/1/join-requests`);
      expect(cards[0].querySelector('.card-status').title).toBe('Join request pending');
      expect(cards[0].querySelector('[aria-label="Cancel join request"] app-action-icon[name="cancel"]')).not.toBeNull();
    });
  }

});
