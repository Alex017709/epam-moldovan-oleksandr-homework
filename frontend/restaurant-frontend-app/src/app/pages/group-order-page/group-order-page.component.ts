import { Component, inject, signal, computed, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="group-order-container">
      <header class="header">
        <h1>Керування груповим попереднім замовленням</h1>
        <p class="subtitle">Переглядайте вибір гостей та відправте спільне замовлення в ресторан.</p>
      </header>

      @if (isLoading()) {
        <div class="loading">Завантаження даних...</div>
      } @else if (hasError()) {
        <div class="error-state">
          <p>{{ errorMessage() || 'Group reservation not found' }}</p>
          <button class="btn-submit" (click)="loadData()">Try again</button>
        </div>
      } @else {
        @if (unsubmittedCount() > 0 && participants().length > 0) {
          <div class="warning-banner">
            {{ unsubmittedCount() }} participant hasn’t submitted…
          </div>
        }

        <div class="status-badge-text">Collecting pre-orders</div>

        @if (statusMessage()) {
          <div class="status-banner">{{ statusMessage() }}</div>
        }

        @if (participants().length === 0 || totalItemsCount() === 0) {
          <div class="empty-state">Participants haven’t added any dishes yet</div>
        }

        <div class="participants-section">
          <h2>Учасники групи</h2>
          <div class="cards-grid">
            @for (participant of participants(); track participant.id) {
              <div class="participant-card" [class.owner-card]="participant.type === 'Owner'">
                <div class="card-header">
                  <span class="name">
                    {{ participant.type === 'Owner' ? 'My Pre-Order' : 'Guest: ' + participant.name }}
                  </span>
                  <span class="badge" [class.submitted]="participant.isSubmitted">
                    {{ participant.isSubmitted ? 'Підтверджено' : 'Обирає' }}
                  </span>
                </div>
                <ul class="items-list">
                  @for (item of participant.items; track item.dishId || item.dish?.id) {
                    <li>
                      <span>{{ item.dish?.name || 'Страва' }} (x{{ item.quantity }})</span>
                      <span class="price">{{ (item.dish?.price || 0) * item.quantity }} грн</span>
                    </li>
                  }
                </ul>
                <div class="card-footer">
                  <span>Сума: <strong>{{ participant.total }} грн</strong></span>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="summary-section">
          @if (lastUpdatedText()) {
            <div class="updated-at">
              {{ lastUpdatedText() }} <button class="btn-refresh" (click)="loadData()">Refresh</button>
            </div>
          }
          <div class="total-amount">
            Загальна сума замовлення: <span>$\{{ grandTotal().toFixed(2) }}</span>
          </div>
          
          @if (!submittedSuccessfully()) {
            <button 
              class="btn-submit" 
              [disabled]="isSubmitting() || hasNoSubmittedParticipants()"
              (click)="openSubmitModal()">
              Submit Pre-Order
            </button>
          } @else {
            <div class="success-text">Sent to Restaurant</div>
          }
        </div>

        @if (isModalOpen()) {
          <div class="modal-backdrop">
            <div class="modal-content">
              <p>Confirm submit?</p>
              <button class="btn-submit" (click)="confirmSubmit()">Submit</button>
              <button class="btn-cancel" (click)="isModalOpen.set(false)">Cancel</button>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .group-order-container { max-width: 900px; margin: 0 auto; padding: 24px; font-family: Arial, sans-serif; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .loading, .error-state, .empty-state { text-align: center; padding: 40px; font-size: 18px; color: #007bff; }
    .error-state { color: #dc3545; }
    .warning-banner { background: #ffc107; padding: 12px; border-radius: 6px; margin-bottom: 16px; font-weight: bold; }
    .status-badge-text { font-weight: bold; margin-bottom: 8px; color: #17a2b8; }
    .status-banner { background: #e2e3e5; padding: 8px; border-radius: 4px; margin-bottom: 16px; }
    .updated-at { font-size: 12px; color: #666; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .participant-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
    .owner-card { border-color: #007bff; background-color: #f8f9fa; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .name { font-weight: bold; }
    .badge { font-size: 12px; padding: 4px 8px; border-radius: 4px; background: #ffc107; }
    .badge.submitted { background: #28a745; color: #fff; }
    .items-list { list-style: none; padding: 0; margin: 0 0 16px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; }
    .items-list li { display: flex; justify-content: space-between; padding: 8px 0; }
    .card-footer { display: flex; justify-content: space-between; align-items: center; }
    .summary-section { background: #e9ecef; padding: 20px; border-radius: 8px; display: flex; flex-direction: column; align-items: flex-end; gap: 16px; }
    .total-amount span { font-weight: bold; color: #28a745; font-size: 22px; }
    .btn-submit { background: #28a745; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .btn-submit:disabled { background: #6c757d; cursor: not-allowed; }
    .btn-cancel { background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-left: 8px; }
    .success-text { font-weight: bold; color: #28a745; font-size: 18px; }
    .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; }
    .modal-content { background: white; padding: 24px; border-radius: 8px; text-align: center; }
  `]
})
export class GroupOrderPageComponent implements OnInit, OnDestroy {
  private groupOrdersService = inject(GroupOrdersService);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  participants = signal<Participant[]>([]);
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);
  submittedSuccessfully = signal<boolean>(false);
  lastUpdatedText = signal<string | null>(null);
  statusMessage = signal<string | null>(null);
  isModalOpen = signal<boolean>(false);

  groupReservationId = signal<string>('grp-1');
  reservationId = signal<string>('res-1');

  unsubmittedCount = computed(() => {
    return this.participants().filter(p => !p.isSubmitted).length;
  });

  hasNoSubmittedParticipants = computed(() => {
    return !this.participants().some(p => p.isSubmitted);
  });

  totalItemsCount = computed(() => {
    return this.participants().reduce((acc, p) => acc + (p.items?.length || 0), 0);
  });

  grandTotal = computed(() => {
    return this.participants()
      .filter(p => p.isSubmitted)
      .reduce((sum: number, p: Participant) => sum + (p.total || 0), 0);
  });

  ngOnInit() {
    const resId = this.route.snapshot.paramMap.get('reservationId') || this.route.snapshot.paramMap.get('groupReservationId') || 'res-1';
    this.reservationId.set(resId);
    this.groupReservationId.set(resId === 'res-1' ? 'grp-1' : resId);

    this.groupOrdersService.getGroupInvite$(this.reservationId()).subscribe({
      next: (invite) => {
        if (invite && invite.GroupReservationId) {
          this.groupReservationId.set(invite.GroupReservationId);
        }
        this.loadData();
      },
      error: () => {
        this.loadData();
      }
    });

    // Періодична синхронізація кожні 15 секунд згідно з вимогами рівня 3
    this.sub = interval(15000).pipe(
      switchMap(() => this.groupOrdersService.getSessions$(this.groupReservationId(), { silent: true }))
    ).subscribe({
      next: (res) => {
        if (res && res.participants) {
          this.participants.set(res.participants);
          this.lastUpdatedText.set('Updated at ' + new Date().toLocaleTimeString());
        }
      },
      error: () => {
        this.statusMessage.set("Couldn’t refresh");
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  loadData() {
    this.isLoading.set(true);
    this.hasError.set(false);
    this.groupOrdersService.getSessions$(this.groupReservationId()).subscribe({
      next: (res: GroupSessionsResponse) => {
        this.participants.set(res.participants || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.hasError.set(true);
        this.errorMessage.set(err?.error?.message || 'Group reservation not found');
      }
    });
  }

  openSubmitModal() {
    this.isModalOpen.set(true);
  }

  confirmSubmit() {
    if (this.isSubmitting() || this.submittedSuccessfully()) return;
    this.isSubmitting.set(true);
    this.isModalOpen.set(false);

    this.groupOrdersService.submit$(this.groupReservationId(), this.reservationId()).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.submittedSuccessfully.set(true);
        this.sub?.unsubscribe(); // Зупиняємо синхронізацію після успішного сабміту
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }
}