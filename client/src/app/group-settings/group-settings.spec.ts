import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GroupSettings } from './group-settings';
const api = 'http://localhost:3000/api';
const group = { id: 42, name: 'Car', description: 'Cars', minimumAge: 15, colour: '#728fce', isGroupAdmin: true };
describe('Group Settings', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [GroupSettings], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  async function setup(admin = true) {
    const fixture = TestBed.createComponent(GroupSettings); fixture.componentRef.setInput('groupId', 42); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${api}/my/groups`).flush([{ ...group, isGroupAdmin: admin }]); fixture.detectChanges();
    http.expectOne(`${api}/groups/42/rooms`).flush(['General']); await fixture.whenStable(); return fixture;
  }
  it('displays settings, saves all four fields, emits the updated group and retains rooms', async () => {
    const fixture = await setup(); const http = TestBed.inject(HttpTestingController);
    expect(fixture.nativeElement.textContent).toContain('Group Settings'); expect(fixture.componentInstance.name).toBe('Car');
    const emitted = vi.fn(); fixture.componentInstance.saved.subscribe(emitted);
    Object.assign(fixture.componentInstance, { name: 'New Car', description: 'New description', colour: '#123456', minimumAge: 0 });
    fixture.componentInstance.save(); fixture.componentInstance.save();
    const sent = http.expectOne(`${api}/groups/42`);
    expect(sent.request.method).toBe('PUT'); expect(sent.request.body).toEqual({ name: 'New Car', description: 'New description', colour: '#123456', minimumAge: 0 });
    const updated = { ...group, ...sent.request.body }; sent.flush({ group: updated }); fixture.detectChanges();
    http.expectOne(`${api}/groups/42/rooms`).flush(['General']); await fixture.whenStable();
    expect(emitted).toHaveBeenCalledWith(updated); expect(fixture.nativeElement.textContent).toContain('Group settings saved.');
  });
  // DEMO: Checks Members can see rooms but cannot save admin settings.
  it('hides management forms for normal members while showing rooms', async () => {
    const fixture = await setup(false); expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('General'); fixture.componentInstance.save();
    TestBed.inject(HttpTestingController).expectNone(`${api}/groups/42`);
  });
  it('shows server validation/authorization failures without replacing the saved group', async () => {
    const fixture = await setup(); fixture.componentInstance.save();
    TestBed.inject(HttpTestingController).expectOne(`${api}/groups/42`).flush({ message: 'Access denied' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Access denied'); expect(fixture.componentInstance.group()?.name).toBe('Car');
  });
});
