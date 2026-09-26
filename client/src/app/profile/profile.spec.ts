import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Profile } from './profile';
import { calculateAge } from '../shared/age';

const api = 'http://localhost:3000/api/users/1';
const user = {
  id: 1, username: 'existing-user', firstName: 'First', lastName: 'Last',
  email: 'user@example.com', dob: '2000-09-27', role: 'user', groups: []
};

describe('Profile', () => {
  let fixture: ComponentFixture<Profile>;
  let component: Profile;
  let http: HttpTestingController;

  beforeEach(async () => {
    // Node 26's global localStorage is unavailable without a file; use an
    // in-memory browser storage substitute so tests stay isolated.
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear()
    });
    localStorage.setItem('currentUser', JSON.stringify({ ...user, firstName: 'Stale cache' }));
    await TestBed.configureTestingModule({
      imports: [Profile],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
  });
  afterEach(() => {
    http.verify();
    fixture.destroy();
    localStorage.clear();
    vi.unstubAllGlobals();
  });
  async function load() {
    http.expectOne(api).flush(user);
    await fixture.whenStable();
  }

  it('loads the latest profile and shows age without password inputs', async () => {
    expect(component.loading()).toBe(true);
    await load();
    expect(component.currentUser()).toEqual(user);
    expect(component.age()).toBe(calculateAge(user.dob));
    expect(fixture.nativeElement.textContent).toContain('Age:');
    expect(fixture.nativeElement.textContent).not.toContain('Stale cache');
    expect(component.loading()).toBe(false);
  });
  it('recalculates age immediately from the DOB input and cancels without saving', async () => {
    await load();
    component.startEditing();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#dob') as HTMLInputElement;
    input.value = '1990-01-01';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(component.age()).toBe(calculateAge('1990-01-01'));
    expect(component.currentUser()?.dob).toBe(user.dob);
    expect(fixture.nativeElement.querySelector('[name="role"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[name="password"]')).toBeNull();
    component.cancelEditing();
    expect(component.age()).toBe(calculateAge(user.dob));
    http.expectNone(api);
  });
  it('saves editable fields, updates cached state, and fetches again after refresh', async () => {
    await load();
    component.startEditing();
    component.updateField('username', 'renamed');
    component.updateField('dob', '1995-01-01');
    component.saveProfile();
    expect(component.saving()).toBe(true);
    const save = http.expectOne(api);
    expect(save.request.method).toBe('PUT');
    expect(Object.keys(save.request.body).sort()).toEqual(['dob', 'email', 'firstName', 'lastName', 'username']);
    const updated = { ...user, username: 'renamed', dob: '1995-01-01' };
    save.flush({ success: true, user: updated });
    expect(component.currentUser()).toEqual(updated);
    expect(JSON.parse(localStorage.getItem('currentUser')!)).toEqual(updated);
    expect(component.successMessage()).toContain('successfully');
    expect(component.editing()).toBe(false);
    expect(component.saving()).toBe(false);
    fixture.destroy();
    // Recreating the page simulates refresh; it must fetch MongoDB's version.
    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    http.expectOne(api).flush({ ...updated, firstName: 'Latest from server' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Latest from server');
    expect(fixture.nativeElement.textContent).toContain('renamed');
  });
  it('shows save errors and keeps the draft available to retry', async () => {
    await load();
    component.startEditing();
    component.updateField('firstName', 'Draft');
    component.saveProfile();
    http.expectOne(api).flush({ message: 'Unable to save' }, { status: 500, statusText: 'Error' });
    expect(component.errorMessage()).toBe('Unable to save');
    expect(component.saving()).toBe(false);
    expect(component.editing()).toBe(true);
    expect(component.draft().firstName).toBe('Draft');
    expect(component.currentUser()?.firstName).toBe('First');
  });
  it('shows loading errors and can retry', async () => {
    http.expectOne(api).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toContain('Unable to load');
    component.loadProfile();
    await load();
    expect(component.errorMessage()).toBe('');
  });
  it('keeps Super Admin role read-only', async () => {
    http.expectOne(api).flush({ ...user, role: 'superAdmin' });
    component.startEditing();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('superAdmin');
    expect(fixture.nativeElement.querySelector('[name="role"]')).toBeNull();
    expect(Object.hasOwn(component.draft(), 'role')).toBe(false);
  });
});
