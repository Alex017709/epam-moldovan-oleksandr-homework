import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';

@Injectable({
  providedIn: 'root'
})
export class GroupOrdersService {
  private http = inject(HttpClient);

  getSessions$(groupReservationId: string, options?: { silent?: boolean }): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(`/api/guest/groups/${groupReservationId}/sessions`);
  }

  // Дублер для сумісності з компонентом
  getGroupSessions$(groupReservationId: string): Observable<GroupSessionsResponse> {
    return this.getSessions$(groupReservationId);
  }

  getOwnerSessionId$(reservationId: string): Observable<any> {
    return this.http.get<any>(`/api/reservations/${reservationId}/guest-session-id`);
  }

  getGroupInvite$(reservationId: string): Observable<any> {
    return this.http.get<any>(`/api/reservations/${reservationId}/invite-token`);
  }

  submit$(groupReservationId: string, reservationId?: string): Observable<any> {
    return this.http.post<any>(`/api/group-reservations/${groupReservationId}/submit`, { reservationId });
  }

  // Дублер для сумісності з компонентом
  submitGroupPreOrder$(groupReservationId: string): Observable<any> {
    return this.submit$(groupReservationId);
  }

  removeSession$(groupReservationId: string, guestSessionId: string): Observable<GroupSessionsResponse> {
    return this.http.delete<GroupSessionsResponse>(`/api/guest/groups/${groupReservationId}/sessions/${guestSessionId}`);
  }

  getStatus$(groupReservationId: string, options?: { silent?: boolean }): Observable<any> {
    return this.http.get<any>(`/api/guest/groups/${groupReservationId}/status`);
  }
}