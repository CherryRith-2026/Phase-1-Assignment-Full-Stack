import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type JoinState = 'available' | 'pending' | 'member' | 'ineligible';
export interface Group {
  id: number;
  name: string;
  description: string;
  minimumAge: number;
}
export interface AvailableGroup extends Group {
  joinState: JoinState;
  eligibilityMessage: string;
}
@Injectable({ providedIn: 'root' })
export class GroupApi {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/api';
  myGroups() { return this.http.get<Group[]>(`${this.api}/my/groups`); }
  availableGroups() { return this.http.get<AvailableGroup[]>(`${this.api}/groups/available`); }
  cancelRequest(id: number) {
    // No username or user ID: the backend identifies the owner from the token.
    return this.http.delete<{ success: boolean; message: string; joinState: JoinState; eligibilityMessage: string }>(
      `${this.api}/groups/${id}/join-requests`
    );
  }
  requestToJoin(id: number) {
    // Identity and DOB come from the server-side session, not browser fields.
    return this.http.post<{ success: boolean; message: string; joinState: JoinState }>(
      `${this.api}/groups/${id}/join-requests`, {}
    );
  }
}
