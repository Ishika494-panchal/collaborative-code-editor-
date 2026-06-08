import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { config } from '../config';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  username = '';
  avatarUrl = '';
  joinRoomId = '';
  isCreating = false;
  joinError = '';

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.http.get<any>(`${config.apiUrl}/verify`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res.authenticated && res.user) {
          this.username = res.user.username || 'User';
          this.avatarUrl = res.user.avatarUrl || '';
        } else {
          this.router.navigate(['/login']);
        }
      },
      error: () => {
        this.router.navigate(['/login']);
      }
    });
  }

  createRoom() {
    this.isCreating = true;
    this.http.post<any>(`${config.apiUrl}/api/rooms`, {}, { withCredentials: true }).subscribe({
      next: (res) => {
        this.isCreating = false;
        this.router.navigate(['/rooms', res.roomId]);
      },
      error: (err) => {
        this.isCreating = false;
        console.error('Error creating room', err);
        alert('Failed to create room. Please try again.');
      }
    });
  }

  joinRoom() {
    this.joinError = '';
    const roomId = this.joinRoomId.trim();
    if (!roomId) {
      this.joinError = 'Please enter a Room ID';
      return;
    }
    // Validate room exists before navigating
    this.http.get<any>(`${config.apiUrl}/api/rooms/${roomId}`, { withCredentials: true }).subscribe({
      next: () => {
        this.router.navigate(['/rooms', roomId]);
      },
      error: () => {
        this.joinError = 'Room not found. Please check the Room ID.';
      }
    });
  }

  logout() {
    this.http.post<any>(`${config.apiUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}
