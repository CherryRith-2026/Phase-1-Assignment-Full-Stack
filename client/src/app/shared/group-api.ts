import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type JoinState = 'available' | 'pending' | 'member' | 'ineligible';
export interface Group {
  id: number;
  name: string;
  description: string;
  minimumAge: number;
  colour?: string;
  isGroupAdmin?: boolean;
}
export interface PendingJoinRequest { id: string; userId: number; username: string; firstName: string; lastName: string; age: number | null; status: 'pending' | 'approving'; }
export interface GroupMember { id: number; username: string; isGroupAdmin: boolean; }
export interface CreationInput { name: string; description: string; minimumAge: number; colour: string; }
export interface CreationRequest extends CreationInput {
  id: string; userId: number; username: string;
  status: 'pending' | 'approving' | 'approved' | 'rejected' | 'cancelled'; groupId?: number;
}
export interface AvailableGroup extends Group {
  joinState: JoinState;
  eligibilityMessage: string;
}
@Injectable({ providedIn: 'root' })
export class GroupApi {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/api';
  creationRequests(review = false) {
    return this.http.get<CreationRequest[]>(`${this.api}/${review ? 'admin' : 'my'}/group-creation-requests`);
  }
  requestGroup(input: CreationInput) {
    return this.http.post<{ message: string; request: CreationRequest }>(`${this.api}/group-creation-requests`, input);
  }
  resolveCreation(id: string, action: 'approve' | 'reject') {
    return this.http.post<{ message: string; request: CreationRequest }>(`${this.api}/admin/group-creation-requests/${id}/${action}`, {});
  }
  cancelCreation(id: string) {
    return this.http.delete<{ message: string; request: CreationRequest }>(`${this.api}/group-creation-requests/${id}`);
  }
  pendingJoinRequests(id: number) {
    return this.http.get<PendingJoinRequest[]>(`${this.api}/groups/${id}/join-requests`);
  }
  resolveJoinRequest(groupId: number, requestId: string, action: 'approve' | 'reject') {
    return this.http.post<{ message: string; status: string }>(`${this.api}/groups/${groupId}/join-requests/${requestId}/${action}`, {});
  }
  groupMembers(id: number) {
    return this.http.get<{ canManage: boolean; members: GroupMember[] }>(`${this.api}/groups/${id}/members`);
  }
  promoteMember(groupId: number, memberId: number) {
    return this.http.post<{ message: string; member: GroupMember }>(`${this.api}/groups/${groupId}/admins/${memberId}`, {});
  }
  leaveGroup(id: number) {
    return this.http.delete<{ success: boolean; message: string }>(`${this.api}/groups/${id}/members/me`);
  }
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
