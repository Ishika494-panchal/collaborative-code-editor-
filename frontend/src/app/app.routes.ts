import { Routes } from '@angular/router';
import { CreateRoomComponent } from './rooms/create-room/create-room.component';
import { RoomComponent } from './rooms/room/room.component';

export const routes: Routes = [
  { path: '', redirectTo: 'rooms/create', pathMatch: 'full' },
  { path: 'rooms/create', component: CreateRoomComponent },
  { path: 'rooms/:id', component: RoomComponent }
];
