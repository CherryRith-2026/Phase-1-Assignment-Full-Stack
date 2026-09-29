import { sessionInterceptor } from '../shared/session';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { LeaveGroup } from './leave-group';
const api = 'http://localhost:3000/api';
describe('Leave Group', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [LeaveGroup], providers: [
    provideRouter([]), provideHttpClient(), provideHttpClientTesting()
  ] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('sends one identity-free delete and returns Home after successful leaving', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LeaveGroup);
    fixture.componentRef.setInput('groupId', 42);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button');
    button.click(); button.click();
    const sent = TestBed.inject(HttpTestingController).expectOne(`${api}/groups/42/members/me`);
    expect(sent.request.method).toBe('DELETE'); expect(sent.request.body).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    sent.flush({ success: true, message: 'You have left the group.' });
    expect(navigate).toHaveBeenCalledWith(['/home']);
  });
  for (const [status, message] of [[409, 'Assign another Group Admin before leaving this group.'], [403, 'You are not a member of this group.'], [401, 'Please log in again.'], [500, 'Unable to leave the group. Please retry.']] as const) {
    it(`keeps the page and displays the HTTP ${status} error`, async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(LeaveGroup);
      fixture.componentRef.setInput('groupId', 42);
      await fixture.whenStable();
      fixture.componentInstance.leave();
      TestBed.inject(HttpTestingController).expectOne(`${api}/groups/42/members/me`).flush(status === 500 ? {} : { message }, { status, statusText: 'Error' });
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain(message);
      expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  }
  it('resolves the selected legacy chat membership without confusing same-name groups', async () => {
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: convertToParamMap({ groupId: '12' }) } } });
    const fixture = TestBed.createComponent(LeaveGroup);
    fixture.componentRef.setInput('groupName', 'Music');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${api}/my/groups`).flush([
      { id: 2, name: 'Music' }, { id: 12, name: 'Music' }
    ]);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedId()).toBe(12);
  });
  it('does not offer leaving to a nonmember on a legacy chat page', async () => {
    const fixture = TestBed.createComponent(LeaveGroup);
    fixture.componentRef.setInput('groupName', 'Study');
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${api}/my/groups`).flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.componentInstance.leave();
    TestBed.inject(HttpTestingController).expectNone(request => request.method === 'DELETE');
  });
  it('Study leave sends the selected membership ID and session token to the exact Express route', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'sessionToken' ? 'a'.repeat(64) : null });
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [LeaveGroup], providers: [
        provideRouter([]), provideHttpClient(withInterceptors([sessionInterceptor])), provideHttpClientTesting()
      ] });
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const fixture = TestBed.createComponent(LeaveGroup);
      fixture.componentRef.setInput('groupName', 'Study');
      fixture.detectChanges();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne(`${api}/my/groups`).flush([{ id: 1, name: 'Study' }]);
      await fixture.whenStable();
      fixture.nativeElement.querySelector('button').click();
      const sent = http.expectOne(`${api}/groups/1/members/me`);
      expect(sent.request.method).toBe('DELETE');
      expect(sent.request.body).toBeNull();
      expect(sent.request.headers.get('Authorization')).toBe(`Bearer ${'a'.repeat(64)}`);
      sent.flush({ message: 'Assign another Group Admin before leaving this group.' }, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('Assign another Group Admin before leaving this group.');
      expect(fixture.nativeElement.textContent).not.toContain('Unable to leave the group. Please retry.');
      expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

});
