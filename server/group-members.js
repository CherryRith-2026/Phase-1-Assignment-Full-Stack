import { requireUser } from './sessions.js';
import { isMember, isGroupAdmin } from './group-requests.js';

const validId = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
// Read only the fields needed to resolve legacy memberships. Credentials and
// profile details are neither queried nor returned by member management.
const memberFields = { projection: { _id: 0, id: 1, username: 1, groups: 1 } };
const publicMember = (group, user) => ({
  id: user.id, username: user.username, isGroupAdmin: isGroupAdmin(group, user)
});

export function registerGroupMembers(app, db) {
  const groups = db.collection('groups');
  const users = db.collection('users');
  const authenticated = requireUser(db);

  app.get('/api/groups/:groupId/members', authenticated, async (req, res) => {
    if (!validId(req.params.groupId)) return res.status(400).json({ message: 'Invalid group ID.' });
    const group = await groups.findOne({ id: Number(req.params.groupId) });
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!isMember(group, req.currentUser)) return res.status(403).json({ message: 'You are not a member of this group.' });
    const candidates = await users.find(Array.isArray(group.adminIds) ? { id: { $in: group.memberIds || [] } } : {}, memberFields).sort({ id: 1 }).toArray();
    res.json({ canManage: isGroupAdmin(group, req.currentUser),
      members: candidates.filter(user => isMember(group, user)).map(user => publicMember(group, user)) });
  });

  app.post('/api/groups/:groupId/admins/:memberId', authenticated, async (req, res) => {
    if (!validId(req.params.groupId) || !validId(req.params.memberId)) {
      return res.status(400).json({ message: 'Invalid group or member ID.' });
    }
    const id = Number(req.params.groupId);
    const memberId = Number(req.params.memberId);
    while (true) {
      const group = await groups.findOne({ id });
      if (!group) return res.status(404).json({ message: 'Group not found.' });
      if (!isGroupAdmin(group, req.currentUser)) return res.status(403).json({ message: 'Group Admin access required for this group.' });
      const target = await users.findOne({ id: memberId }, memberFields);
      if (!target || !isMember(group, target)) return res.status(409).json({ message: 'Only an existing member of this group can be made Group Admin.' });
      let updated;
      if (Array.isArray(group.adminIds)) {
        // Check actor authority and BOTH memberships in the same atomic write.
        // A concurrent departure cannot give admin authority to a nonmember.
        updated = await groups.findOneAndUpdate({ id,
          memberIds: { $all: [req.currentUser.id, memberId] }, adminIds: req.currentUser.id
        }, { $addToSet: { adminIds: memberId } }, { returnDocument: 'after' });
      } else {
        // Legacy Study/Music use names (including user.groups). Resolve all
        // current memberships before switching this group to authoritative IDs.
        // Retain historical fields, room data, and all unrelated group fields.
        const candidates = await users.find({}, memberFields).toArray();
        const members = candidates.filter(user => isMember(group, user));
        const snapshot = { id };
        for (const field of ['name', 'admin', 'adminIds', 'memberIds', 'members', 'leftMemberIds']) {
          snapshot[field] = Object.hasOwn(group, field) ? { $eq: group[field] } : { $exists: false };
        }
        // A concurrent legacy leave changes this snapshot and forces a retry.
        if (!members.some(user => user.id === memberId)) continue;
        updated = await groups.findOneAndUpdate(snapshot, { $set: {
          memberIds: [...new Set(members.map(user => user.id))],
          adminIds: [...new Set([...members.filter(user => isGroupAdmin(group, user)).map(user => user.id), memberId])]
        } }, { returnDocument: 'after' });
      }
      if (!updated) continue;
      res.json({ message: 'Member is now a Group Admin.', member: publicMember(updated, target) });
      return;
    }
  });
}
