import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-group-order',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './group-order.component.html',
  styleUrls: ['./group-order.component.css']
})
export class GroupOrderComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  // Сигнали для зберігання стану
  participants = signal<any[]>([]);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  groupReservationId = signal<string>('demo-group-id');

  // Computed сигнал для автоматичного підрахунку загальної суми групи
  grandTotal = computed(() => {
    return this.participants().reduce((sum, p) => sum + (p.total || 0), 0);
  });

  ngOnInit() {
    // Отримуємо ID групи з параметра маршруту або використовуємо демо-значення
    const id = this.route.snapshot.paramMap.get('reservationId') || 'demo-group-id';
    this.groupReservationId.set(id);
    this.loadGroupSessions();
  }

  // Завантаження сесій учасників (1-й рівень бекенду)
  loadGroupSessions() {
    this.isLoading.set(true);
    this.http.get<any>(`/api/guest/groups/${this.groupReservationId()}/sessions`).subscribe({
      next: (data) => {
        this.participants.set(data.participants || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Помилка завантаження сесій:', err);
        // Мок-дані для демонстрації/тестування без реального бекенду
        this.participants.set([
          {
            id: '1',
            type: 'Owner',
            name: 'John Owner (Ви)',
            items: [{ dish: { name: 'Caesar Salad', price: 180 }, quantity: 1 }],
            total: 180,
            isSubmitted: true
          },
          {
            id: '2',
            type: 'Guest',
            name: 'Olena Guest',
            items: [{ dish: { name: 'Tom Yum', price: 220 }, quantity: 1 }],
            total: 220,
            isSubmitted: true
          }
        ]);
        this.isLoading.set(false);
      }
    });
  }

  // Підтвердження спільного замовлення (2-й рівень бекенду)
  submitOrder() {
    this.http.post(`/api/group-reservations/${this.groupReservationId()}/submit`, {
      reservationId: this.groupReservationId()
    }).subscribe({
      next: () => {
        alert('Замовлення успішно підтверджено та відправлено в ресторан!');
      },
      error: (err) => {
        console.error('Помилка підтвердження:', err);
        alert('Не вдалося підтвердити замовлення. Перевірте, чи є підтверджені сесії.');
      }
    });
  }

  // Видалення учасника із групи (3-й рівень бекенду)
  removeParticipant(guestSessionId: string) {
    if (!confirm('Ви впевнені, що хочете видалити цього учасника?')) return;

    this.http.delete(`/api/guest/groups/${this.groupReservationId()}/sessions/${guestSessionId}`).subscribe({
      next: (res: any) => {
        if (res && res.participants) {
          this.participants.set(res.participants);
        } else {
          this.loadGroupSessions();
        }
      },
      error: (err) => {
        console.error('Помилка видалення сесії:', err);
        // Локальне видалення для демо-режиму
        this.participants.update(list => list.filter(p => p.id !== guestSessionId));
      }
    });
  }
}