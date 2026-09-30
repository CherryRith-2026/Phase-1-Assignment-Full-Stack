import { randomUUID } from 'node:crypto';

// Keep chatRooms strings for the established CRUD API. References supply stable
// message identities; deleted IDs are never reused, even if a name is reused.
export function roomReferences(group) {
  return (group.chatRooms || []).map(name =>
    group.roomRefs?.find(room => room.name === name) || { id: randomUUID(), name });
}

export async function ensureRoomReferences(groups, id) {
  while (true) {
    const group = await groups.findOne({ id });
    if (!group) return null;
    const refs = roomReferences(group);
    if (JSON.stringify(refs) === JSON.stringify(group.roomRefs)) return group;
    const filter = { id, chatRooms: group.chatRooms ?? { $exists: false },
      roomRefs: group.roomRefs ? { $eq: group.roomRefs } : { $exists: false } };
    const updated = await groups.findOneAndUpdate(filter, { $set: { roomRefs: refs } }, { returnDocument: 'after' });
    if (updated) return updated;
  }
}
