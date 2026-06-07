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
  
  editorOptions = { theme: 'vs-dark', language: 'javascript' };
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
  output: string = 'Welcome to the CodeSync terminal.\nClick "Run Code" to execute...';

  private ydoc = new Y.Doc();
  private ytext: Y.Text;
  private monacoBinding: any;
  private editorInstance: any;

  private subs: Subscription = new Subscription();
  private cursorDecorations: Map<string, string[]> = new Map();
  private activeUsers: any[] = [];

  constructor(private socketService: SocketService, private http: HttpClient) {
    this.ytext = this.ydoc.getText('monaco');
  }

  ngOnInit() {
    this.subs.add(this.socketService.onRoomUsers().subscribe(users => {
      this.activeUsers = users;
    }));

    this.ydoc.on('update', (update) => {
      const updateBase64 = btoa(String.fromCharCode.apply(null, Array.from(update)));
      this.socketService.sendCrdtUpdate(this.roomId, updateBase64);
    });

    this.subs.add(this.socketService.onCrdtSync().subscribe(updateBase64 => {
      try {
        const update = new Uint8Array(atob(updateBase64).split('').map(c => c.charCodeAt(0)));
        Y.applyUpdate(this.ydoc, update);
      } catch(e) {}
    }));

    this.subs.add(this.socketService.onCrdtUpdate().subscribe(data => {
      try {
        const update = new Uint8Array(atob(data.updateBase64).split('').map(c => c.charCodeAt(0)));
        Y.applyUpdate(this.ydoc, update);
      } catch(e) {}
    }));

    this.subs.add(this.socketService.onCursorUpdate().subscribe(data => {
      this.renderRemoteCursor(data.senderId, data.position);
    }));

    this.subs.add(this.socketService.onLanguageChange().subscribe(language => {
      this.editorOptions = { ...this.editorOptions, language };
      if (this.editorInstance) {
        monaco.editor.setModelLanguage(this.editorInstance.getModel(), language);
      }
    }));

    this.subs.add(this.socketService.onExecutionOutput().subscribe(output => {
      this.output = output;
      if (output === 'Executing container...') {
        this.isExecuting = true;
      } else {
        this.isExecuting = false;
      }
    }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    if (this.monacoBinding) this.monacoBinding.destroy();
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
          className: `remote-cursor-${senderId}`,
          hoverMessage: { value: `**${user.name}**` },
          beforeContentClassName: 'remote-cursor-before'
        }
      }
    ]);
    this.cursorDecorations.set(senderId, newDecorations);

    let styleEl = document.getElementById(`cursor-style-${senderId}`);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = `cursor-style-${senderId}`;
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `.remote-cursor-${senderId} { border-left: 2px solid ${user.color}; position: absolute; }`;
  }

  runCode() {
    this.isExecuting = true;
    this.output = 'Executing container...';
    this.socketService.sendExecutionOutput(this.roomId, this.output);

    const code = this.ytext.toString();
    const language = this.editorOptions.language;

    // Send POST to API Gateway
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
            this.output = `[Error] Failed to connect to execution service.\nPlease ensure Docker Desktop and backend services are running.`;
          }
          this.socketService.sendExecutionOutput(this.roomId, this.output);
        }
      });
  }
}
