import { TestBed } from '@angular/core/testing';
import { ChatConnection, RoomChat } from './room-chat';
class FakeSocket {
  handlers = new Map<string, Function>();
  requests: {event: string; body: any}[] = [];
  disconnected = false;
  failSend = false;
  on(event: string, handler: Function) { this.handlers.set(event, handler); return this; }
  fire(event: string, body?: any) { this.handlers.get(event)?.(body); }
  connect() { this.fire('connect'); return this; }
  disconnect() { this.disconnected = true; return this; }
  removeAllListeners() { this.handlers.clear(); }
  timeout() { return this; }
  async emitWithAck(event: string, body: any) {
    this.requests.push({event,body});
    if (event === 'chat:join') return { ok: true, room: {roomId: body.name, name: body.name}, messages: [{id:'history',roomId:body.name,username:'Member',type:'text',text:`History of ${body.name}`,createdAt:'2026-01-01'}], users:[{id:1,username:'Member'}] };
    return this.failSend ? {ok:false,message:'Membership required'} : {ok:true,message:{id:'sent',roomId:body.roomId,username:'Member',createdAt:'2026-01-01',...body}};
  }
}
describe('MongoDB room chat', () => {
  let sockets: FakeSocket[];
  beforeEach(() => {
    sockets = [];
    TestBed.configureTestingModule({imports:[RoomChat],providers:[{provide:ChatConnection,useValue:{open:()=>{const socket=new FakeSocket(); sockets.push(socket); return socket;}}}]});
  });
  async function setup() { const fixture=TestBed.createComponent(RoomChat); fixture.componentRef.setInput('groupId',42); fixture.componentRef.setInput('roomName','First'); fixture.detectChanges(); await fixture.whenStable(); await Promise.resolve(); fixture.detectChanges(); return fixture; }
  it('selects the actual group/room, shows history and sends text without client identity',async()=>{
    const fixture=await setup(), component=fixture.componentInstance;
    expect(sockets[0].requests[0]).toEqual({event:'chat:join',body:{groupId:42,name:'First'}});
    expect(fixture.nativeElement.textContent).toContain('History of First');
    component.text='Hello'; await component.send(); await fixture.whenStable();
    expect(sockets[0].requests[1]).toEqual({event:'chat:send',body:{roomId:'First',type:'text',text:'Hello'}});
    expect(component.text).toBe(''); expect(component.messages().length).toBe(2);
    sockets[0].fire('chat:message',component.messages()[1]); expect(component.messages().length).toBe(2);
  });
  // DEMO: Checks switching rooms removes old history and ignores messages from another room.
  it('switches history, disconnects old rooms and ignores other-room events',async()=>{
    const fixture=await setup(); fixture.componentRef.setInput('roomName','Second'); fixture.detectChanges(); await fixture.whenStable(); await Promise.resolve(); fixture.detectChanges();
    expect(sockets[0].disconnected).toBe(true); expect(fixture.nativeElement.textContent).not.toContain('History of First'); expect(fixture.nativeElement.textContent).toContain('History of Second');
    sockets[1].fire('chat:message',{id:'wrong',roomId:'First',text:'Wrong room'}); expect(fixture.componentInstance.messages().length).toBe(1);
    fixture.destroy(); expect(sockets[1].disconnected).toBe(true);
  });
  it('renders live messages/presence/notices and follows a room rename without losing messages',async()=>{
    const fixture=await setup(), component=fixture.componentInstance;
    sockets[0].fire('chat:presence',{roomId:'First',users:[{id:2,username:'New member'}]});
    sockets[0].fire('chat:notice',{roomId:'First',text:'New member joined the room.'});
    sockets[0].fire('chat:message',{id:'live',roomId:'First',username:'New member',type:'text',text:'Live text',createdAt:'2026-01-01'});
    sockets[0].fire('chat:room',{roomId:'First',name:'Renamed',rooms:['Renamed']}); await fixture.whenStable();
    expect(component.room()?.name).toBe('Renamed'); expect(component.messages().length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('New member joined the room.'); expect(fixture.nativeElement.textContent).toContain('Live text');
  });
  it('sends image content, retains failed drafts and disables access after revocation',async()=>{
    const fixture=await setup(), component=fixture.componentInstance;
    component.image.set('data:image/png;base64,test'); await component.send(); expect(sockets[0].requests[1].body.type).toBe('image'); expect(component.image()).toBe('');
    sockets[0].failSend=true; component.text='Draft'; await component.send(); expect(component.text).toBe('Draft'); expect(component.error()).toBe('Membership required');
    sockets[0].fire('chat:revoked',{message:'This chat room no longer exists.'}); await fixture.whenStable();
    expect(component.room()).toBeNull(); expect(component.messages()).toEqual([]); expect(component.users()).toEqual([]); expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
  });
});

describe('Chat connection authentication', () => {
  it('uses the session token and does not connect before the component is ready', () => {
    vi.stubGlobal('localStorage', {getItem: (key: string) => key === 'sessionToken' ? 'session-token' : null});
    try {
      const socket = new ChatConnection().open();
      expect(socket.auth).toEqual({token: 'session-token'});
      expect(socket.connected).toBe(false);
      socket.disconnect();
    } finally { vi.unstubAllGlobals(); }
  });
});
