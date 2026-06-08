import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { SocketService } from '../services/socket.service';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { config } from '../config';

declare const monaco: any;

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorModule],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.css']
})
export class EditorComponent implements OnInit, OnDestroy {
  @Input() roomId: string = '';
  
  editorOptions = { theme: 'vs-dark', language: 'javascript', automaticLayout: true };
  languages = [
    { id: 'javascript', name: 'JavaScript' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'python', name: 'Python' },
    { id: 'java', name: 'Java' },
    { id: 'c', name: 'C' },
    { id: 'cpp', name: 'C++' },
    { id: 'go', name: 'Go' },
    { id: 'rust', name: 'Rust' },
    { id: 'ruby', name: 'Ruby' },
    { id: 'php', name: 'PHP' },
    { id: 'csharp', name: 'C#' },
    { id: 'swift', name: 'Swift' },
    { id: 'shell', name: 'Shell/Bash' }
  ];

  // Execution State
  isExecuting: boolean = false;
  output: string = 'Welcome to CodeSync terminal.\nClick "Run Code" to execute...';

  private ydoc = new Y.Doc();
  private ytext: Y.Text;
  private monacoBinding: any;
  private editorInstance: any;
  private isApplyingRemote = false; // Flag to prevent CRDT echo loop

  private subs: Subscription = new Subscription();
  private cursorDecorations: Map<string, string[]> = new Map();
  private activeUsers: any[] = [];

  constructor(private socketService: SocketService, private http: HttpClient) {
    this.ytext = this.ydoc.getText('monaco');
  }

  ngOnInit() {
    // Listen for room users
    this.subs.add(this.socketService.onRoomUsers().subscribe(users => {
      this.activeUsers = users;
    }));

    // ─── CRDT: Send local updates to server ─────────────────────────────────
    // Only send if the update originated locally (not from a remote apply)
    this.ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'remote') return; // Skip remote updates to prevent echo loop
      const updateBase64 = btoa(String.fromCharCode.apply(null, Array.from(update)));
      this.socketService.sendCrdtUpdate(this.roomId, updateBase64);
    });

    // ─── CRDT: Receive full state sync on join ──────────────────────────────
    this.subs.add(this.socketService.onCrdtSync().subscribe(updateBase64 => {
      try {
        const update = new Uint8Array(atob(updateBase64).split('').map(c => c.charCodeAt(0)));
        Y.applyUpdate(this.ydoc, update, 'remote'); // Mark as remote origin
      } catch(e) {
        console.warn('CRDT sync error:', e);
      }
    }));

    // ─── CRDT: Receive incremental updates ──────────────────────────────────
    this.subs.add(this.socketService.onCrdtUpdate().subscribe(data => {
      // Skip updates from ourselves
      if (data.senderId === this.socketService.socketId) return;
      try {
        const update = new Uint8Array(atob(data.updateBase64).split('').map(c => c.charCodeAt(0)));
        Y.applyUpdate(this.ydoc, update, 'remote'); // Mark as remote origin
      } catch(e) {
        console.warn('CRDT update error:', e);
      }
    }));

    // ─── Remote cursor updates ──────────────────────────────────────────────
    this.subs.add(this.socketService.onCursorUpdate().subscribe(data => {
      if (data.senderId === this.socketService.socketId) return;
      this.renderRemoteCursor(data.senderId, data.position);
    }));

    // ─── Remote language changes ────────────────────────────────────────────
    this.subs.add(this.socketService.onLanguageChange().subscribe(data => {
      const language = data.language || data;
      this.editorOptions = { ...this.editorOptions, language };
      if (this.editorInstance) {
        monaco.editor.setModelLanguage(this.editorInstance.getModel(), language);
      }
    }));

    // ─── Remote execution output ────────────────────────────────────────────
    this.subs.add(this.socketService.onExecutionOutput().subscribe(data => {
      const output = data.output || data;
      this.output = output;
      this.isExecuting = (output === 'Executing...');
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.monacoBinding) this.monacoBinding.destroy();
    // Clean up cursor style elements
    this.cursorDecorations.forEach((_, senderId) => {
      const styleEl = document.getElementById(`cursor-style-${senderId}`);
      if (styleEl) styleEl.remove();
    });
  }

  onLanguageChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    this.editorOptions = { ...this.editorOptions, language: target.value };
    if (this.editorInstance) {
        monaco.editor.setModelLanguage(this.editorInstance.getModel(), target.value);
    }
    this.socketService.sendLanguageChange(this.roomId, target.value);
  }

  onInit(editor: any) {
    this.editorInstance = editor;

    this.monacoBinding = new MonacoBinding(
      this.ytext,
      this.editorInstance.getModel(),
      new Set([this.editorInstance])
    );

    this.editorInstance.onDidChangeCursorPosition((e: any) => {
      this.socketService.sendCursorMove(this.roomId, e.position);
    });
  }

  private renderRemoteCursor(senderId: string, position: any) {
    if (!this.editorInstance) return;

    const user = this.activeUsers.find(u => u.id === senderId);
    if (!user) return;

    const oldDecorations = this.cursorDecorations.get(senderId) || [];
    const newDecorations = this.editorInstance.deltaDecorations(oldDecorations, [
      {
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        options: {
          className: `remote-cursor-${senderId.replace(/[^a-zA-Z0-9]/g, '')}`,
          hoverMessage: { value: `**${user.name}**` },
          beforeContentClassName: 'remote-cursor-before'
        }
      }
    ]);
    this.cursorDecorations.set(senderId, newDecorations);

    const safeId = senderId.replace(/[^a-zA-Z0-9]/g, '');
    let styleEl = document.getElementById(`cursor-style-${safeId}`);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = `cursor-style-${safeId}`;
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `.remote-cursor-${safeId} { border-left: 2px solid ${user.color}; position: absolute; }`;
  }

  runCode() {
    this.isExecuting = true;
    this.output = 'Executing...';
    this.socketService.sendExecutionOutput(this.roomId, this.output);

    const code = this.ytext.toString();
    const language = this.editorOptions.language;

    this.http.post<any>(`${config.apiUrl}/api/execute`, { language, code }, { withCredentials: true }).subscribe({
        next: (res) => {
          this.output = res.output;
          this.isExecuting = false;
          this.socketService.sendExecutionOutput(this.roomId, this.output);
        },
        error: (err) => {
          this.isExecuting = false;
          if (err.error && err.error.error) {
            this.output = `[Error] ${err.error.error}`;
          } else {
            this.output = `[Error] Failed to connect to execution service.\nPlease ensure backend services are running.`;
          }
          this.socketService.sendExecutionOutput(this.roomId, this.output);
        }
      });
  }
}
