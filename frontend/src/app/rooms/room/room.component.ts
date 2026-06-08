import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EditorComponent } from '../../editor/editor.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SocketService } from '../../services/socket.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { config } from '../../config';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, EditorComponent, SidebarComponent],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  roomId: string = '';
  currentUser = { name: 'Guest-' + Math.floor(Math.random() * 1000) };
  copied = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.roomId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Connect socket first
    this.socketService.connect();

    // Wait a tick for the socket to connect, then join
    setTimeout(() => {
      this.http.get<any>(`${config.apiUrl}/verify`, { withCredentials: true }).subscribe({
        next: (res) => {
          if (res.authenticated && res.user?.username) {
            this.currentUser = { name: res.user.username };
          }
          this.socketService.joinRoom(this.roomId, this.currentUser);
        },
        error: () => {
          this.socketService.joinRoom(this.roomId, this.currentUser);
        }
      });
    }, 300);
  }

  copyRoomId() {
    navigator.clipboard.writeText(this.roomId).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }

  copyRoomLink() {
    const url = `${window.location.origin}/rooms/${this.roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      this.copied = true;
      setTimeout(() => this.copied = false, 2000);
    });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  ngOnDestroy() {
    if (this.roomId) {
      this.socketService.leaveRoom(this.roomId);
    }
    this.socketService.disconnect();
  }
}
