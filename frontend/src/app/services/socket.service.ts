import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { config } from '../config';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private _socketId$ = new BehaviorSubject<string>('');

  /** Current socket ID (useful for identifying self in user lists) */
  get socketId(): string {
    return this._socketId$.value;
  }

  /** Connect to the WebSocket server (call once when entering a room) */
  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(config.socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to WebSocket server:', this.socket?.id);
      this._socketId$.next(this.socket?.id || '');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
    });
  }

  /** Disconnect from the WebSocket server (call when leaving a room) */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this._socketId$.next('');
    }
  }

  joinRoom(roomId: string, user: any) {
    this.socket?.emit('join-room', { roomId, user });
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('leave-room', roomId);
  }

  sendCrdtUpdate(roomId: string, updateBase64: string) {
    this.socket?.emit('crdt-update', { roomId, updateBase64 });
  }

  sendCursorMove(roomId: string, position: any) {
    this.socket?.emit('cursor-move', { roomId, position });
  }

  sendLanguageChange(roomId: string, language: string) {
    this.socket?.emit('language-change', { roomId, language });
  }

  sendExecutionOutput(roomId: string, output: string) {
    this.socket?.emit('execution-output', { roomId, output });
  }

  // ─── Observables ──────────────────────────────────────────────────────────

  onCrdtSync(): Observable<string> {
    return this.createListener<string>('crdt-sync');
  }

  onCrdtUpdate(): Observable<any> {
    return this.createListener<any>('crdt-update');
  }

  onCursorUpdate(): Observable<any> {
    return this.createListener<any>('cursor-update');
  }

  onLanguageChange(): Observable<any> {
    return this.createListener<any>('language-change');
  }

  onExecutionOutput(): Observable<any> {
    return this.createListener<any>('execution-output');
  }

  onRoomUsers(): Observable<any[]> {
    return this.createListener<any[]>('room-users');
  }

  /**
   * Helper: Creates an Observable that listens to a socket event.
   * Automatically removes the previous listener for this event to prevent duplicates.
   */
  private createListener<T>(event: string): Observable<T> {
    return new Observable<T>(observer => {
      if (!this.socket) {
        console.warn(`Socket not connected when subscribing to "${event}"`);
        return;
      }

      // Remove any existing listeners for this event to prevent duplicates
      this.socket.off(event);

      const handler = (data: T) => observer.next(data);
      this.socket.on(event, handler);

      // Cleanup when unsubscribed
      return () => {
        this.socket?.off(event, handler);
      };
    });
  }
}
