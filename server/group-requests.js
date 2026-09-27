import { calculateAge } from '../shared/age.mjs';
import { requireUser } from './sessions.js';

// Assignment minimum ages are applied to MongoDB at startup. Eligibility
// always reads the group's stored minimumAge and the user's current DOB.
export const groupMinimumAges = {
  Study: 16, Music: 16, 'Exam Revision': 16, Shopping: 16,
  Suppliers: 18, 'Gift Ideas': 16, 'Vacation Trips': 18, 'Flowers and Plants': 16
};

export function isMember(group, user) {
  // Keep Phase 1 membership data usable, including after a profile rename.
  return group.memberIds?.includes(user.id) || group.members?.includes(user.username)
    || user.groups?.includes(group.name) || false;
}

export function eligibility(group, user, today = new Date()) {
  const minimumAge = group.minimumAge == null || group.minimumAge === '' ? 0 : Number(group.minimumAge);
  if (!Number.isInteger(minimumAge) || minimumAge < 0) {
    return { eligible: false, message: 'This group has an invalid minimum age. Please try again later.' };
  }
  if (minimumAge === 0) return { eligible: true, message: '' };
  const age = calculateAge(user.dob, today);
  if (age === null) return { eligible: false, message: `Add a valid date of birth to your profile. Minimum age: ${minimumAge}.` };
  if (age < minimumAge) return { eligible: false, message: `You must be at least ${minimumAge} years old to request to join this group.` };
  return { eligible: true, message: '' };
}

export function registerGroupRequests(app, db) {
  const groups = db.collection('groups');
  const requests = db.collection('joinRequests');
  const authenticated = requireUser(db);
  const publicFields = { projection: { _id: 0, password: 0 } };

  app.get('/api/my/groups', authenticated, async (req, res) => {
    const all = await groups.find({}, publicFields).sort({ id: 1 }).toArray();
    res.json(all.filter(group => isMember(group, req.currentUser)));
  });

  app.get('/api/groups/available', authenticated, async (req, res) => {
    const pending = await requests.find({ userId: req.currentUser.id, status: 'pending' }).toArray();
    const pendingIds = new Set(pending.map(request => request.groupId));
    const all = await groups.find({}, publicFields).sort({ id: 1 }).toArray();
    res.json(all.map(group => {
      const member = isMember(group, req.currentUser);
      const check = eligibility(group, req.currentUser);
      return {
        id: group.id, name: group.name, description: group.description || '',
        minimumAge: group.minimumAge ?? 0,
        joinState: member ? 'member' : pendingIds.has(group.id) ? 'pending' : check.eligible ? 'available' : 'ineligible',
        eligibilityMessage: check.message
      };
    }));
  });

  const requestToJoin = async (req, res) => {
    const group = await groups.findOne({ id: Number(req.params.groupId) });
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    const user = req.currentUser;
    if (isMember(group, user)) return res.status(409).json({ joinState: 'member', message: 'You are already a member of this group.' });
    if (await requests.findOne({ userId: user.id, groupId: group.id, status: 'pending' })) {
      return res.status(409).json({ joinState: 'pending', message: 'Your request is already pending.' });
    }
    // Ignore all client-supplied age, DOB, role and user identifiers.
    const check = eligibility(group, user);
    if (!check.eligible) return res.status(403).json({ joinState: 'ineligible', message: check.message });
    try {
      await requests.insertOne({ userId: user.id, groupId: group.id, status: 'pending', createdAt: new Date() });
    } catch (error) {
      // The unique partial index also prevents simultaneous double-clicks.
      if (error.code === 11000) return res.status(409).json({ joinState: 'pending', message: 'Your request is already pending.' });
      throw error;
    }
    // No membership or user role is changed here. Approval comes later.
    res.status(201).json({ success: true, joinState: 'pending', message: 'Request sent. Pending Group Admin approval.' });
  };
  app.delete('/api/groups/:groupId/join-requests', authenticated, async (req, res) => {
    const group = await groups.findOne({ id: Number(req.params.groupId) });
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    const user = req.currentUser;
    if (isMember(group, user)) {
      return res.status(409).json({ joinState: 'member', message: 'You are already a member. There is no pending request to cancel.' });
    }
    // Identity comes only from the session. The status filter prevents deleting
    // an approved request, even if its status changes just before this write.
    const result = await requests.deleteOne({ userId: user.id, groupId: group.id, status: 'pending' });
    const check = eligibility(group, user);
    const state = { joinState: check.eligible ? 'available' : 'ineligible', eligibilityMessage: check.message };
    if (!result.deletedCount) {
      return res.status(404).json({ ...state, message: 'No pending request exists for you in this group.' });
    }
    // Membership and role are never modified by cancellation.
    res.json({ success: true, ...state, message: 'Request cancelled.' });
  });
  app.post('/api/groups/:groupId/join-requests', authenticated, requestToJoin);
  // Retire immediate joining on the old URL too; it cannot bypass requests.
  app.post('/api/groups/:groupId/members', authenticated, requestToJoin);
}

export async function prepareGroupRequests(db, insertWithNextId) {
  await db.collection('joinRequests').createIndex(
    { userId: 1, groupId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } }
  );
  const options = [
    ['Exam Revision', 'Prepare for exams and share revision tips.'],
    ['Shopping', 'Discuss shopping ideas and recommendations.'],
    ['Suppliers', 'Share supplier information and recommendations.'],
    ['Gift Ideas', 'Find and share thoughtful gift ideas.'],
    ['Vacation Trips', 'Discuss destinations and plan vacation ideas.'],
    ['Flowers and Plants', 'Share gardening advice and care tips for flowers and plants.']
  ];
  const groups = db.collection('groups');
  for (const [name, description] of options) {
    if (await groups.findOne({ name: { $regex: `^${name}$`, $options: 'i' } })) continue;
    try {
      // Stable _id prevents duplicate defaults on concurrent startup. Numeric
      // id remains the API identifier. Existing group details are preserved.
      await insertWithNextId(groups, {
        _id: `default-group:${name}`, name, description, minimumAge: groupMinimumAges[name],
        admin: '', members: [], chatRooms: []
      });
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?._id) throw error;
    }
  }
  // Update only minimumAge, including groups that already existed before this
  // requirement. Never delete memberships, pending requests, or other fields.
  for (const [name, minimumAge] of Object.entries(groupMinimumAges)) {
    await groups.updateMany(
      { name: { $regex: `^${name}$`, $options: 'i' } },
      { $set: { minimumAge } }
    );
  }
}
