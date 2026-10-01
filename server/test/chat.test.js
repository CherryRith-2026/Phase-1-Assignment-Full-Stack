import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { MongoClient } from 'mongodb';
import { io } from 'socket.io-client';
import sharp from 'sharp';
import { createSession } from '../sessions.js';
import { createChatServer } from '../index.js';
let directory, mongod, mongo, db, chat, base;
const sockets = [], tokens = {};
// DEMO: Uses a temporary MongoDB instance and sockets, keeping the demo database untouched.
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fabulari-chat-test-'));
  const listener = createServer().listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  mongod = spawn('mongod', ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--logpath', join(directory, 'mongo.log')], { stdio: 'ignore' });
  await once(mongod, 'spawn');
  mongo = new MongoClient(`mongodb://127.0.0.1:${port}`, { serverSelectionTimeoutMS: 15000 }); await mongo.connect(); db = mongo.db('isolated_chat');
  for (let id = 1; id <= 5; id++) {
    await db.collection('users').insertOne({ id, username: `user${id}`, password: 'never exposed', role: id === 5 ? 'superAdmin' : 'user', dob: id === 4 ? '2020-01-01' : '1990-01-01' });
    tokens[id] = await createSession(db, id);
  }
  await db.collection('groups').insertMany([
    { id: 901, name: 'Dynamic test', minimumAge: 16, memberIds: [1,2,4,5], adminIds: [1], chatRooms: ['First','Second'] },
    { id: 902, name: 'Other test', minimumAge: 0, memberIds: [1], adminIds: [1], chatRooms: ['First'] }
  ]);
  chat = createChatServer(db); chat.server.listen(0, '127.0.0.1'); await once(chat.server, 'listening'); base = `http://127.0.0.1:${chat.server.address().port}`;
});
after(async () => {
  sockets.forEach(socket => socket.disconnect());
  if (chat) await new Promise(resolve => chat.io.close(resolve));
  if (mongo) await mongo.close();
  if (mongod && mongod.exitCode === null) { const done = once(mongod, 'exit'); mongod.kill('SIGTERM'); await done; }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function connect(id) { const socket = io(base, { auth: { token: tokens[id] }, transports: ['websocket'], reconnection: false }); sockets.push(socket); await once(socket, 'connect'); return socket; }
const call = (socket, name, body) => socket.timeout(5000).emitWithAck(`chat:${name}`, body);
const enter = (socket, name = 'First', groupId = 901) => call(socket, 'join', { groupId, name });
async function api(path, method, body, id = 1) {
  const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${tokens[id]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
test('socket handshake requires a real session; membership, age and superAdmin restrictions use server data', async () => {
  const invalid = io(base, { auth: { token: 'fake', role: 'groupAdmin', userId: 1 }, reconnection: false }); sockets.push(invalid);
  assert.match((await once(invalid, 'connect_error'))[0].message, /log in/);
  for (const id of [3,4,5]) { const socket = await connect(id); assert.equal((await enter(socket)).ok, false); socket.disconnect(); }
  const socket = await connect(1); assert.equal((await enter(socket, 'Missing')).ok, false); socket.disconnect();
});
// DEMO: Checks room isolation, trusted sender identity and the latest five persisted messages.
test('dynamic rooms isolate live messages/history, trust session sender, and return only the latest five persisted messages', async () => {
  const first = await connect(1), second = await connect(2);
  const entry = await enter(first), other = await enter(second, 'Second'); assert.equal(entry.ok, true);
  const received = []; second.on('chat:message', message => received.push(message));
  for (let index = 0; index < 7; index++) {
    const sent = await call(first, 'send', { roomId: entry.room.roomId, type: 'text', text: `message ${index}`, username: 'spoof', senderId: 999 });
    assert.equal(sent.ok, true); assert.equal(sent.message.username, 'user1'); assert.equal(sent.message.senderId, 1); assert.equal('password' in sent.message, false);
  }
  assert.deepEqual(received, []); assert.equal(other.messages.length, 0);
  assert.equal((await call(second, 'send', { roomId: entry.room.roomId, type: 'text', text: 'cross room' })).ok, false);
  const same = await enter(second); assert.equal(same.messages.length, 5); assert.equal(same.messages[0].text, 'message 2');
  const live = once(second, 'chat:message'); await call(first, 'send', { roomId: entry.room.roomId, type: 'text', text: 'live' }); assert.equal((await live)[0].text, 'live');
  assert.equal((await enter(first, 'First', 902)).messages.length, 0);
  assert.equal(await db.collection('messages').countDocuments({ groupId: 901, roomId: entry.room.roomId }), 8);
  first.disconnect(); second.disconnect();
  const reconnected = await connect(1); assert.equal((await enter(reconnected)).messages.at(-1).text, 'live'); reconnected.disconnect();
});
// DEMO: Checks valid images persist while invalid images and text are rejected.
test('PNG/GIF images persist; fake images, JPEG and blank/oversized text are rejected', async () => {
  const socket = await connect(1), entry = await enter(socket, 'Second');
  for (const format of ['png','gif']) {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ff0000' } }).toFormat(format).toBuffer();
    const result = await call(socket, 'send', { roomId: entry.room.roomId, type: 'image', image: `data:image/${format};base64,${bytes.toString('base64')}` });
    assert.equal(result.ok, true); assert.match(result.message.image, new RegExp(`^data:image/${format}`));
  }
  for (const content of [{type:'text',text:' '},{type:'text',text:'x'.repeat(4001)}, {type:'image',image:'data:image/png;base64,aGVsbG8='},{type:'image',image:'data:image/jpeg;base64,aGVsbG8='}]) assert.equal((await call(socket,'send',{roomId:entry.room.roomId,...content})).ok,false);
  assert.equal((await enter(socket,'Second')).messages.length,2); socket.disconnect();
});
// DEMO: Checks multiple tabs show one active user and joins/leaves are announced.
test('presence is live, deduplicates tabs and announces joins/leaves', async () => {
  const first = await connect(1); await enter(first);
  const second = await connect(2); const notice = once(first,'chat:notice'); const entry = await enter(second);
  assert.match((await notice)[0].text,/user2 joined/); assert.equal(entry.users.length,2);
  const tab = await connect(2); assert.equal((await enter(tab)).users.length,2);
  tab.disconnect();
  const left = once(first,'chat:notice'); await call(second,'leave',{}); assert.match((await left)[0].text,/user2 left/);
  first.disconnect(); second.disconnect();
});
test('rename preserves room ID/history; delete revokes chat and same-name recreation cannot resurrect messages', async () => {
  const socket = await connect(1), entry = await enter(socket);
  assert.equal((await api('/api/groups/901/rooms/First','PUT',{name:'Renamed'},2)).status,403);
  assert.equal((await api('/api/groups/901/rooms/First','PUT',{name:'Renamed'})).status,200);
  const renamed = await enter(socket,'Renamed'); assert.equal(renamed.room.roomId,entry.room.roomId); assert.ok(renamed.messages.length);
  const revoked = once(socket,'chat:revoked'); assert.equal((await api('/api/groups/901/rooms/Renamed','DELETE')).status,200); assert.match((await revoked)[0].message,/no longer exists/);
  assert.equal((await call(socket,'send',{roomId:entry.room.roomId,type:'text',text:'deleted'})).ok,false);
  assert.equal((await api('/api/groups/901/rooms','POST',{name:'Renamed'})).status,200);
  const fresh = await enter(socket,'Renamed'); assert.notEqual(fresh.room.roomId,entry.room.roomId); assert.deepEqual(fresh.messages,[]);
  assert.ok(await db.collection('messages').countDocuments({roomId:entry.room.roomId})); socket.disconnect();
});
test('legacy membership groups use the same dynamic chat and image size limits are enforced', async () => {
  await db.collection('groups').insertOne({id:903,name:'Legacy fixture',minimumAge:16,members:['user1'],admin:'user1',chatRooms:['Legacy room']});
  const socket = await connect(1), entry = await enter(socket,'Legacy room',903);
  assert.equal(entry.ok,true);
  assert.equal((await call(socket,'send',{roomId:entry.room.roomId,type:'text',text:'Legacy member message'})).ok,true);
  assert.equal((await call(socket,'send',{roomId:entry.room.roomId,type:'image',image:'data:image/png;base64,'+'A'.repeat(1398104)})).ok,false);
  socket.disconnect();
});
test('MongoDB history survives a socket server restart, and changed age rules revoke connected access', async () => {
  sockets.forEach(socket => socket.disconnect());
  await new Promise(resolve => chat.io.close(resolve));
  chat = createChatServer(db); chat.server.listen(0,'127.0.0.1'); await once(chat.server,'listening'); base = `http://127.0.0.1:${chat.server.address().port}`;
  const socket = await connect(1); assert.equal((await enter(socket,'Second')).messages.length,2);
  const revoked = once(socket,'chat:revoked');
  assert.equal((await api('/api/groups/901','PUT',{minimumAge:120})).status,200); await revoked;
  assert.equal((await enter(socket,'Second')).ok,false);
  await api('/api/groups/901','PUT',{minimumAge:16}); socket.disconnect();
});
// DEMO: Checks existing socket access is revoked after leaving or logging out.
test('leaving and logging out revoke access on already connected sockets', async () => {
  const socket = await connect(2); await enter(socket,'Second');
  const revoked = once(socket,'chat:revoked'); assert.equal((await api('/api/groups/901/members/me','DELETE',undefined,2)).status,200); await revoked;
  assert.equal((await enter(socket,'Second')).ok,false); socket.disconnect();
  const admin = await connect(1); const entry = await enter(admin,'Second'); const loggedOut = once(admin,'chat:revoked');
  assert.equal((await api('/api/logout','POST',{},1)).status,200); await loggedOut;
  assert.equal((await call(admin,'send',{roomId:entry.room.roomId,type:'text',text:'logged out'})).ok,false); admin.disconnect();
});
