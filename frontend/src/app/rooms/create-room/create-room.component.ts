import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [],
  templateUrl: './create-room.component.html',
  styleUrls: ['./create-room.component.css']
})
export class CreateRoomComponent {
  constructor(private http: HttpClient, private router: Router) {}

  createRoom() {
    this.http.post<any>('http://localhost:3002/api/rooms', {}, { withCredentials: true })
      .subscribe({
        next: (res: any) => {
          this.router.navigate(['/rooms', res.roomId]);
        },
        error: (err: any) => {
          console.error('Error creating room', err);
          alert('Failed to create room. Check if the backend is running and you are authenticated.');
        }
      });
  }
}
