import { randomUUID } from 'node:crypto';
import { roomReferences } from './chat-rooms.js';
import { requireUser } from './sessions.js';
import { isMember, isGroupAdmin } from './group-requests.js';

function textField(value, maximum, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    const error = new Error(`${label} must contain 1–${maximum} characters.`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

export function registerGroupManagement(app, db) {
  const groups = db.collection('groups');
  const authenticated = requireUser(db);

  // Retry only when a concurrent edit changes the group. Matching the original
  // document prevents overwriting membership, admin, or room changes.
  async function edit(req, res, change) {
    const id = Number(req.params.id ?? req.params.groupId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid group ID.' });
    while (true) {
      const group = await groups.findOne({ id });
      if (!group) return res.status(404).json({ message: 'Group not found.' });
      if (!isGroupAdmin(group, req.currentUser)) return res.status(403).json({ message: 'Group Admin access required for this group.' });
      const changes = await change(group);
      // Check every field we rely on, including absence of legacy/new fields.
      const filter = { id };
      for (const field of ['name', 'description', 'colour', 'minimumAge', 'admin', 'adminIds', 'memberIds', 'members', 'leftMemberIds', 'chatRooms', 'roomRefs']) {
        filter[field] = Object.hasOwn(group, field) ? { $eq: group[field] } : { $exists: false };
      }
      const updated = await groups.findOneAndUpdate(filter, { $set: changes }, { returnDocument: 'after', projection: { _id: 0 } });
      if (!updated) continue;
      return res.json({ success: true, message: 'Group updated successfully.', group: { ...updated, isGroupAdmin: isGroupAdmin(updated, req.currentUser) }, chatRooms: updated.chatRooms || [] });
    }
  }

  app.put('/api/groups/:id', authenticated, (req, res) => edit(req, res, async group => {
    const body = req.body ?? {};
    const changes = {};
    if (Object.hasOwn(body, 'name')) changes.name = textField(body.name, 80, 'Name');
    if (Object.hasOwn(body, 'description')) changes.description = textField(body.description, 1000, 'Description');
    if (Object.hasOwn(body, 'colour')) {
      if (typeof body.colour !== 'string' || !/^#[a-f0-9]{6}$/i.test(body.colour)) throw Object.assign(new Error('Colour must be a six-digit hex colour.'), { status: 400 });
      changes.colour = body.colour.toLowerCase();
    }
    if (Object.hasOwn(body, 'minimumAge')) {
      if (!Number.isInteger(body.minimumAge) || body.minimumAge < 0 || body.minimumAge > 120) throw Object.assign(new Error('Minimum age must be an integer from 0 to 120.'), { status: 400 });
      changes.minimumAge = body.minimumAge;
      changes.minimumAgeEdited = true;
    }
    if (!Object.keys(changes).length) throw Object.assign(new Error('Provide at least one editable group field.'), { status: 400 });
    if (changes.name !== undefined && changes.name !== group.name && !Array.isArray(group.adminIds)) {
      const users = await db.collection('users').find({}, { projection: { id: 1, username: 1, groups: 1 } }).toArray();
      const members = users.filter(user => isMember(group, user));
      changes.memberIds = members.map(user => user.id);
      changes.adminIds = members.filter(user => isGroupAdmin(group, user)).map(user => user.id);
    }
    return changes;
  }));

  app.get('/api/groups/:groupId/rooms', authenticated, async (req, res) => {
    const id = Number(req.params.groupId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid group ID.' });
    const group = await groups.findOne({ id });
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!isMember(group, req.currentUser)) return res.status(403).json({ message: 'Group membership required.' });
    res.json(group.chatRooms || []);
  });
  for (const method of ['post', 'put', 'delete']) {
    app[method](`/api/groups/:groupId/rooms${method === 'post' ? '' : '/:roomName'}`, authenticated, (req, res) => edit(req, res, group => {
      const rooms = [...(group.chatRooms || [])];
      const refs = roomReferences(group);
      const index = method === 'post' ? -1 : rooms.indexOf(req.params.roomName);
      if (method !== 'post' && index < 0) throw Object.assign(new Error('Chat room not found.'), { status: 404 });
      if (method === 'delete') { rooms.splice(index, 1); refs.splice(index, 1); }
      else {
        const name = textField(req.body?.name, 80, 'Room name');
        if (rooms.some((room, i) => i !== index && room.trim().toLowerCase() === name.toLowerCase())) {
          throw Object.assign(new Error('A room with that name already exists.'), { status: 409 });
        }
        if (method === 'post') { rooms.push(name); refs.push({ id: randomUUID(), name }); }
        else { rooms[index] = name; refs[index] = { ...refs[index], name }; }
      }
      return { chatRooms: rooms, roomRefs: refs };
    }));
  }
}
