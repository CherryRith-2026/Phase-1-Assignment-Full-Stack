import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ChatConnection } from '../room-chat/room-chat';
import { GroupRooms } from './group-rooms';
const api = 'http://localhost:3000/api/groups/42/rooms';
describe('Group Rooms', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [GroupRooms], providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  async function setup(admin = true) {
    const fixture = TestBed.createComponent(GroupRooms);
    fixture.componentRef.setInput('group', { id: 42, name: 'Car', isGroupAdmin: admin }); fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(api).flush(['General']); await fixture.whenStable(); return fixture;
  }
  it('lets a normal member select a dynamic room without management controls', async () => {
    const connection = {on() { return this; }, connect() {}, disconnect() {}, removeAllListeners() {}};
    TestBed.overrideProvider(ChatConnection, {useValue: {open: () => connection}});
    const fixture = await setup(false);
    fixture.nativeElement.querySelector('button').click(); await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('General');
    expect(fixture.nativeElement.querySelector('app-room-chat')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Add Room');
    expect(fixture.nativeElement.textContent).not.toContain('Rename');
  });
  it('provides named edit, delete, add and cancel icons without changing room handlers', async () => {
    const fixture = await setup();
    const root = fixture.nativeElement;
    for (const label of ['Rename room', 'Delete room', 'Add room']) {
      const button = root.querySelector(`[aria-label="${label}"]`);
      expect(button.title).toBe(label);
      expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    }
    root.querySelector('[aria-label="Rename room"]').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.editing).toBe('General');
    root.querySelector('[aria-label="Cancel room rename"]').click();
    await fixture.whenStable();
    expect(fixture.componentInstance.editing).toBeNull();
  });
  // DEMO: Checks room CRUD uses the expected HTTP methods and updates the room list.
  it('loads, adds, renames and deletes rooms with immediate updates', async () => {
    const fixture = await setup(); const http = TestBed.inject(HttpTestingController); const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('General');
    component.newName = 'Q&A'; component.change('add'); component.change('add');
    const add = http.expectOne(api); expect(add.request.method).toBe('POST'); expect(add.request.body).toEqual({ name: 'Q&A' }); add.flush({ chatRooms: ['General','Q&A'] });
    component.renamed = 'Questions'; component.change('rename', 'Q&A');
    const rename = http.expectOne(`${api}/Q%26A`); expect(rename.request.method).toBe('PUT'); rename.flush({ chatRooms: ['General','Questions'] });
    component.change('delete', 'Questions'); const remove = http.expectOne(`${api}/Questions`); expect(remove.request.method).toBe('DELETE'); remove.flush({ chatRooms: ['General'] });
    await fixture.whenStable(); expect(component.rooms()).toEqual(['General']); expect(fixture.nativeElement.textContent).not.toContain('Questions');
  });
  it('keeps the list intact on duplicate rejection and hides controls for normal members', async () => {
    const fixture = await setup(); fixture.componentInstance.newName = 'General'; fixture.componentInstance.change('add');
    TestBed.inject(HttpTestingController).expectOne(api).flush({ message: 'Duplicate room' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable(); expect(fixture.nativeElement.textContent).toContain('Duplicate room'); expect(fixture.componentInstance.rooms()).toEqual(['General']);
    fixture.destroy(); const regular = await setup(false); expect(regular.nativeElement.querySelector('button').textContent).toContain('General'); expect(regular.nativeElement.textContent).not.toContain('Rename'); expect(regular.nativeElement.textContent).not.toContain('Delete'); regular.componentInstance.change('delete', 'General'); TestBed.inject(HttpTestingController).expectNone(`${api}/General`);
  });
});
