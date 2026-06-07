import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EditorComponent } from '../../editor/editor.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [EditorComponent, SidebarComponent],
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.css']
})
export class RoomComponent implements OnInit, OnDestroy {
  roomId: string = '';
  // Simulated user data for presence
  currentUser = { name: 'User-' + Math.floor(Math.random() * 1000) };

  constructor(private route: ActivatedRoute, private socketService: SocketService) {}

  ngOnInit() {
    this.roomId = this.route.snapshot.paramMap.get('id') || '';
    if (this.roomId) {
      this.socketService.joinRoom(this.roomId, this.currentUser);
    }
  }

  ngOnDestroy() {
    if (this.roomId) {
      this.socketService.leaveRoom(this.roomId);
    }
  }
}
