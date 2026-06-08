import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EditorComponent } from '../../editor/editor.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SocketService } from '../../services/socket.service';
import { HttpClient } from '@angular/common/http';
import { config } from '../../config';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [EditorComponent, SidebarComponent],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  roomId: string = '';
  currentUser = { name: 'Guest-' + Math.floor(Math.random() * 1000) };

  constructor(
    private route: ActivatedRoute,
    private socketService: SocketService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    if (this.roomId) {
      // Try to get authenticated user name, then join
      this.http.get<any>(`${config.apiUrl}/verify`, { withCredentials: true }).subscribe({
        next: (res) => {
          if (res.authenticated && res.user?.username) {
            this.currentUser = { name: res.user.username };
          }
          this.socketService.joinRoom(this.roomId, this.currentUser);
        },
        error: () => {
          // If verify fails, join as guest
          this.socketService.joinRoom(this.roomId, this.currentUser);
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.roomId) {
      this.socketService.leaveRoom(this.roomId);
    }
  }
}
