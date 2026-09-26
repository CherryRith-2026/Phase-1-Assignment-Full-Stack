import { Component, computed, OnDestroy, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { calculateAge } from '../shared/age';

interface ProfileDetails {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  dob: string;
}
interface ProfileUser extends ProfileDetails {
  id: number;
  role: string;
  groups: string[];
}
const emptyDetails = (): ProfileDetails => ({ username: '', firstName: '', lastName: '', email: '', dob: '' });

@Component({
  selector: 'app-profile',
  imports: [RouterLink, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnDestroy {
  readonly currentUser = signal<ProfileUser | null>(null);
  readonly editing = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly draft = signal<ProfileDetails>(emptyDetails());
  private readonly today = signal(new Date());
  // computed automatically runs again when the draft DOB or edit state changes.
  readonly age = computed(() => calculateAge(
    this.editing() ? this.draft().dob : this.currentUser()?.dob, this.today()
  ));
  readonly maxDob = computed(() => {
    const date = this.today();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  // Also keep age current if this page is left open across a birthday.
  private readonly clock = setInterval(() => this.today.set(new Date()), 60_000);
  private readonly api = 'http://localhost:3000/api/users';

  constructor(private router: Router, private http: HttpClient) {
    this.loadProfile();
  }

  ngOnDestroy() {
    clearInterval(this.clock);
  }

  loadProfile() {
    this.loading.set(true);
    this.errorMessage.set('');
    let id: number | undefined;
    try {
      id = JSON.parse(localStorage.getItem('currentUser') || 'null')?.id;
    } catch {
      // A damaged cache should show a sign-in message, not crash the page.
    }
    if (!Number.isInteger(id) || Number(id) <= 0) {
      this.loading.set(false);
      this.errorMessage.set('Please log in to view your profile.');
      return;
    }
    // The cache identifies the user; MongoDB supplies their latest profile.
    this.http.get<ProfileUser>(`${this.api}/${id}`).subscribe({
      next: user => {
        this.setUser(user);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load your profile. Please retry or log in again.');
      }
    });
  }

  private setUser(user: ProfileUser) {
    this.currentUser.set(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  }

  startEditing() {
    const user = this.currentUser();
    if (!user || this.saving()) return;
    // Copy only editable fields. Role and password never enter the edit form.
    this.draft.set({
      username: user.username, firstName: user.firstName || '',
      lastName: user.lastName || '', email: user.email || '', dob: user.dob || ''
    });
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editing.set(true);
  }

  updateField(field: keyof ProfileDetails, value: string) {
    this.draft.update(details => ({ ...details, [field]: value }));
  }

  cancelEditing() {
    if (this.saving()) return;
    this.editing.set(false);
    this.errorMessage.set('');
  }

  saveProfile() {
    const user = this.currentUser();
    if (!user || !this.editing() || this.saving()) return;
    this.errorMessage.set('');
    this.successMessage.set('');
    if (!this.draft().username.trim()) {
      this.errorMessage.set('Username is required.');
      return;
    }
    if (this.draft().dob && calculateAge(this.draft().dob, this.today()) === null) {
      this.errorMessage.set('Enter a valid date of birth that is not in the future.');
      return;
    }
    this.saving.set(true);
    this.http.put<{ success: boolean; message: string; user: ProfileUser }>(
      `${this.api}/${user.id}`, this.draft()
    ).subscribe({
      next: response => {
        this.saving.set(false);
        if (!response.success) {
          this.errorMessage.set(response.message || 'Unable to save your profile.');
          return;
        }
        this.setUser(response.user);
        this.editing.set(false);
        this.successMessage.set('Profile updated successfully.');
      },
      error: error => {
        this.saving.set(false);
        this.errorMessage.set(error.error?.message || 'Unable to save your profile. Please try again.');
      }
    });
  }

  logout() {
    localStorage.removeItem('currentUser');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }
}
