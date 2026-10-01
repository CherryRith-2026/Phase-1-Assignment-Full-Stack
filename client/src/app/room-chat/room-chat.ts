import { Component, Injectable, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { io, Socket } from 'socket.io-client';
export interface ChatMessage { id: string; roomId: string; username: string; createdAt: string; type: string; text?: string; image?: string; }
interface Room { roomId: string; name: string; }
@Injectable({ providedIn: 'root' })
export class ChatConnection {
  // DEMO: Socket.IO authenticates with the same saved session token as HTTP requests.
  open() { return io('http://localhost:3000', { auth: { token: localStorage.getItem('sessionToken') }, autoConnect: false }); }
}
@Component({ selector: 'app-room-chat', imports: [FormsModule, DatePipe], templateUrl: './room-chat.html', styleUrl: './room-chat.css' })
export class RoomChat {
  readonly groupId = input.required<number>();
  readonly roomName = input.required<string>();
  readonly colour = input('#728fce');
  readonly currentColour = signal('');
  readonly unavailable = output<void>();
  readonly roomsChanged = output<string[]>();
  readonly room = signal<Room | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly users = signal<{id: number; username: string}[]>([]);
  readonly notices = signal<string[]>([]);
  readonly error = signal('');
  readonly sending = signal(false);
  readonly image = signal('');
  text = '';
  private connection = inject(ChatConnection);
  private socket?: Socket;
  constructor() {
    // DEMO: Changing rooms disconnects the old socket and loads the selected room's history.
    effect(onCleanup => {
      const groupId = this.groupId();
      let name = this.roomName();
      const socket = this.connection.open(); this.socket = socket;
      let active = true;
      this.currentColour.set(''); this.room.set(null); this.messages.set([]); this.users.set([]); this.notices.set([]); this.error.set(''); this.image.set(''); this.text = '';
      socket.on('connect', async () => {
        try {
          const result = await socket.timeout(10000).emitWithAck('chat:join', { groupId, name });
          if (!active) return;
          if (!result.ok) { this.error.set(result.message); return; }
          this.room.set(result.room); this.messages.set(result.messages); this.users.set(result.users); this.error.set('');
        } catch { if (active) this.error.set('Unable to enter the room. Use Reconnect to retry.'); }
      });
      socket.on('chat:message', (message: ChatMessage) => this.append(message));
      socket.on('chat:presence', event => { if (event.roomId === this.room()?.roomId) this.users.set(event.users); });
      socket.on('chat:notice', event => { if (event.roomId === this.room()?.roomId) this.notices.update(list => [...list.slice(-19), event.text]); });
      socket.on('chat:room', event => { if (event.roomId === this.room()?.roomId) { name = event.name; this.currentColour.set(event.colour || ''); this.room.set(event); this.roomsChanged.emit(event.rooms); } });
      socket.on('chat:revoked', event => { this.room.set(null); this.messages.set([]); this.users.set([]); this.error.set(event.message); this.unavailable.emit(); });
      socket.on('connect_error', error => this.error.set(error.message));
      socket.on('disconnect', () => { this.room.set(null); this.users.set([]); this.error.set('Chat disconnected. Reconnecting…'); });
      socket.connect();
      onCleanup(() => { active = false; socket.removeAllListeners(); socket.disconnect(); });
    });
  }
  reconnect() { this.socket?.disconnect().connect(); }
  private append(message: ChatMessage) {
    if (message.roomId === this.room()?.roomId) this.messages.update(list => list.some(item => item.id === message.id) ? list : [...list, message]);
  }
  // DEMO: Sends text or the selected image, then waits for the server's confirmation.
  async send() {
    const socket = this.socket, room = this.room();
    if (!socket || !room || this.sending() || (!this.text.trim() && !this.image())) return;
    this.sending.set(true); this.error.set('');
    try {
      const content = this.image() ? { type: 'image', image: this.image() } : { type: 'text', text: this.text };
      const result = await socket.timeout(10000).emitWithAck('chat:send', { roomId: room.roomId, ...content });
      if (socket !== this.socket) return;
      if (!result.ok) this.error.set(result.message);
      else { this.append(result.message); if (content.type === 'image') this.image.set(''); else this.text = ''; }
    } catch { if (socket === this.socket) this.error.set('Send was not confirmed. Check the conversation before retrying.'); }
    finally { this.sending.set(false); }
  }
  // DEMO: Previews a PNG/GIF up to 1 MB; the server validates the actual image too.
  async chooseImage(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!['image/png', 'image/gif'].includes(file.type) || file.size > 1024 * 1024) { this.error.set('Choose a PNG or GIF image up to 1 MB.'); return; }
    const socket = this.socket;
    const reader = new FileReader();
    reader.onload = () => { if (socket === this.socket) this.image.set(String(reader.result)); };
    reader.readAsDataURL(file);
  }
}
