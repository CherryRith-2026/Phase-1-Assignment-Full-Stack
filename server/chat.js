import { Server } from 'socket.io';
import sharp from 'sharp';
import { ObjectId } from 'mongodb';
import { sessionUser } from './sessions.js';
import { eligibility, isMember } from './group-requests.js';
import { ensureRoomReferences } from './chat-rooms.js';

export const MAX_IMAGE_BYTES = 1024 * 1024;
const fail = message => { throw Object.assign(new Error(message), { chatValidation: true }); };
const publicError = error => error.chatValidation ? error.message : 'Chat is temporarily unavailable. Please retry.';

async function messageContent(body) {
  if (body?.type === 'text') {
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 4000) fail('Text must contain 1–4000 characters.');
    return { type: 'text', text: body.text.trim() };
  }
  if (body?.type !== 'image' || typeof body.image !== 'string' || body.image.length > 1400000) fail('Choose a PNG or GIF image up to 1 MB.');
  const match = body.image.match(/^data:image\/(png|gif);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) fail('Only PNG and GIF images are supported.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail('Images must be at most 1 MB.');
  try {
    const decoder = sharp(bytes, { animated: true, limitInputPixels: 16000000 });
    const metadata = await decoder.metadata();
    if (metadata.format !== match[1] || (metadata.pages || 1) > 100) fail('Invalid image.');
    // Decode and re-encode: MIME labels/signatures alone do not validate images.
    const clean = await decoder.toFormat(metadata.format).toBuffer();
    if (clean.length > MAX_IMAGE_BYTES) fail('Image is too large.');
    return { type: 'image', image: `data:image/${metadata.format};base64,${clean.toString('base64')}` };
  } catch { fail('Invalid PNG/GIF image or image exceeds size/dimension limits.'); }
}

const publicMessage = record => ({ id: record._id.toString(), groupId: record.groupId,
  roomId: record.roomId, senderId: record.senderId, username: record.username,
  createdAt: record.createdAt, type: record.type, text: record.text, image: record.image });

export function attachChat(server, db) {
  const io = new Server(server, { cors: { origin: 'http://localhost:4200' }, maxHttpBufferSize: 1500000 });
  const groups = db.collection('groups');
  const messages = db.collection('messages');
  // A single event queue keeps entry/history/live delivery/presence ordered in
  // this single-server student application. MongoDB remains the persistent store.
  let queue = Promise.resolve();
  const enqueue = task => { const result = queue.then(task); queue = result.catch(() => {}); return result; };
  async function identity(socket) {
    const result = await sessionUser(db, socket.handshake.auth?.token);
    if (!result) fail('Please log in again to continue.');
    return result;
  }
  function allowed(group, user) {
    return group && user.role !== 'superAdmin' && isMember(group, user) && eligibility(group, user).eligible;
  }
  async function access(socket, selected = socket.data.selected) {
    const { user } = await identity(socket);
    const group = selected && await groups.findOne({ id: selected.groupId });
    if (!allowed(group, user)) fail('Group membership and minimum-age eligibility are required.');
    const room = group.roomRefs?.find(room => room.id === selected.roomId);
    if (!room) fail('This chat room no longer exists.');
    return { user, group, room };
  }
  const occupants = roomId => [...io.sockets.sockets.values()].filter(s => s.data.selected?.roomId === roomId);
  function presence(roomId, notice) {
    const sockets = occupants(roomId);
    const users = [...new Map(sockets.map(s => [s.data.user.id, { id: s.data.user.id, username: s.data.user.username }])).values()];
    for (const socket of sockets) {
      socket.emit('chat:presence', { roomId, users });
      if (notice) socket.emit('chat:notice', { roomId, text: notice });
    }
  }
  function leave(socket) {
    const selected = socket.data.selected;
    if (!selected) return;
    socket.data.selected = null;
    const remains = occupants(selected.roomId).some(s => s.data.user.id === socket.data.user.id);
    presence(selected.roomId, remains ? undefined : `${socket.data.user.username} left the room.`);
  }
  async function refresh() {
    const changed = new Set();
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.data.selected) continue;
      try {
        const current = await access(socket);
        socket.data.user = current.user;
        socket.emit('chat:room', { groupId: current.group.id, roomId: current.room.id, name: current.room.name,
          rooms: current.group.chatRooms, colour: current.group.colour });
        changed.add(current.room.id);
      } catch (error) {
        socket.emit('chat:revoked', { message: publicError(error) });
        leave(socket);
      }
    }
    for (const id of changed) presence(id);
  }
  io.use(async (socket, next) => {
    try {
      const result = await identity(socket);
      socket.data.user = result.user;
      socket.data.expiresAt = result.session.expiresAt;
      next();
    } catch { next(new Error('Please log in again to continue.')); }
  });
  io.on('connection', socket => {
    const expiry = setTimeout(() => {
      socket.emit('chat:revoked', { message: 'Session expired. Please log in again.' }); socket.disconnect(true);
    }, Math.max(1, new Date(socket.data.expiresAt).getTime() - Date.now()));
    expiry.unref();
    function event(name, handler) {
      socket.on(name, (body, ack) => {
        if (typeof ack !== 'function') return;
        enqueue(async () => {
          if (!socket.connected) return;
          try { ack({ ok: true, ...await handler(body) }); }
          catch (error) { ack({ ok: false, message: publicError(error) }); }
        });
      });
    }
    event('chat:join', async body => {
      leave(socket);
      const { user } = await identity(socket);
      if (!Number.isSafeInteger(body?.groupId) || typeof body?.name !== 'string') fail('Select a valid room.');
      const original = await groups.findOne({ id: body.groupId });
      if (!allowed(original, user)) fail('Group membership and minimum-age eligibility are required.');
      if (!original.chatRooms?.includes(body.name)) fail('Chat room not found.');
      const group = await ensureRoomReferences(groups, body.groupId);
      const room = group?.roomRefs.find(room => room.name === body.name);
      if (!room) fail('Chat room not found.');
      await refresh();
      const selected = { groupId: group.id, roomId: room.id };
      await access(socket, selected);
      const history = await messages.find(selected).sort({ _id: -1 }).limit(5).toArray();
      // Recheck after the history read, before releasing any content.
      await access(socket, selected);
      if (!socket.connected) return {};
      const alreadyHere = occupants(room.id).some(s => s.data.user.id === user.id);
      socket.data.user = user; socket.data.selected = selected;
      presence(room.id, alreadyHere ? undefined : `${user.username} joined the room.`);
      return { room: { ...selected, name: room.name }, messages: history.reverse().map(publicMessage),
        users: [...new Map(occupants(room.id).map(s => [s.data.user.id, { id: s.data.user.id, username: s.data.user.username }])).values()] };
    });
    event('chat:leave', async () => { leave(socket); return {}; });
    event('chat:send', async body => {
      if (body?.roomId !== socket.data.selected?.roomId) fail('Select the room before sending.');
      const { user, group, room } = await access(socket);
      const content = await messageContent(body);
      await access(socket);
      const record = { _id: new ObjectId(), groupId: group.id, roomId: room.id, senderId: user.id,
        username: user.username, createdAt: new Date(), ...content };
      await messages.insertOne(record);
      // Revalidate every receiver: revoked/expired users cannot receive messages.
      await refresh();
      for (const recipient of occupants(room.id)) recipient.emit('chat:message', publicMessage(record));
      return { message: publicMessage(record) };
    });
    socket.on('disconnect', () => { clearTimeout(expiry); enqueue(async () => leave(socket)); });
  });
  return { io, refresh: () => enqueue(refresh) };
}
