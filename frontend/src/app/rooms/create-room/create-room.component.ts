import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { config } from '../../config';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './create-room.component.html',
  styleUrls: ['./create-room.component.css']
})
export class CreateRoomComponent implements OnInit {
  isLoggedIn = false;
  username = '';

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    // Check if user is logged in
    this.http.get<any>(`${config.apiUrl}/verify`, { withCredentials: true }).subscribe({
      next: (res) => {
        if (res.authenticated) {
          this.isLoggedIn = true;
          this.username = res.user?.username || 'User';
        }
      },
      error: () => {
        this.isLoggedIn = false;
      }
    });
  }

  loginWithGithub() {
    // Redirect to GitHub OAuth login
    window.location.href = `${config.apiUrl}/auth/github`;
  }

  createRoom() {
    this.http.post<any>(`${config.apiUrl}/api/rooms`, {}, { withCredentials: true })
      .subscribe({
        next: (res: any) => {
          this.router.navigate(['/rooms', res.roomId]);
        },
        error: (err: any) => {
          console.error('Error creating room', err);
          alert('Failed to create room. Please login first!');
        }
      });
  }
}
