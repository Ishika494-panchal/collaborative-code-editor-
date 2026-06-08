import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { config } from '../config';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;

  constructor() {
    this.socket = io(config.socketUrl, {
      withCredentials: true
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to WebSocket server successfully!');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
    });
  }

  joinRoom(roomId: string, user: any) {
    this.socket.emit('join-room', { roomId, user });
  }

  leaveRoom(roomId: string) {
    this.socket.emit('leave-room', roomId);
  }

  sendCrdtUpdate(roomId: string, updateBase64: string) {
    this.socket.emit('crdt-update', { roomId, updateBase64 });
  }

  sendCursorMove(roomId: string, position: any) {
    this.socket.emit('cursor-move', { roomId, position });
  }

  sendLanguageChange(roomId: string, language: string) {
    this.socket.emit('language-change', { roomId, language });
  }

  sendExecutionOutput(roomId: string, output: string) {
    this.socket.emit('execution-output', { roomId, output });
  }

  onCrdtSync(): Observable<string> {
    return new Observable(observer => {
      this.socket.on('crdt-sync', (data) => observer.next(data));
    });
  }

  onCrdtUpdate(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('crdt-update', (data) => observer.next(data));
    });
  }

  onCursorUpdate(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('cursor-update', (data) => observer.next(data));
    });
  }

  onLanguageChange(): Observable<string> {
    return new Observable(observer => {
      this.socket.on('language-change', (data) => observer.next(data.language));
    });
  }

  onExecutionOutput(): Observable<string> {
    return new Observable(observer => {
      this.socket.on('execution-output', (data) => observer.next(data.output));
    });
  }

  onRoomUsers(): Observable<any[]> {
    return new Observable(observer => {
      this.socket.on('room-users', (users) => observer.next(users));
    });
  }
}
