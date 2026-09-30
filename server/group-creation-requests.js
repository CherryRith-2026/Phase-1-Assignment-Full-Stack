import { ObjectId } from 'mongodb';
import { requireUser } from './sessions.js';
import { eligibility } from './group-requests.js';

export function requireSuperAdmin(req, res, next) {
  if (req.currentUser.role !== 'superAdmin') return res.status(403).json({ message: 'Super Admin access required.' });
  next();
}

export async function prepareGroupCreationRequests(db) {
  await db.collection('groupCreationRequests').createIndex(
    { userId: 1, normalizedName: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approving'] } } }
  );
}

const publicRequest = request => ({
  id: request._id.toString(), userId: request.userId, username: request.username,
  name: request.name, description: request.description, minimumAge: request.minimumAge,
  colour: request.colour, status: request.status, groupId: request.groupId,
  createdAt: request.createdAt
});

export function registerGroupCreationRequests(app, db, insertWithNextId) {
 const requests = db.collection('groupCreationRequests');
const groups = db.collection('groups');
const auditLogs = db.collection('auditLogs');
const authenticated = requireUser(db);
  app.get('/api/my/group-creation-requests', authenticated, async (req, res) => {
    res.json((await requests.find({ userId: req.currentUser.id }).sort({ createdAt: -1 }).toArray()).map(publicRequest));
  });
  app.delete('/api/group-creation-requests/:id', authenticated, async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid request ID.' });
    const owner = { _id: new ObjectId(req.params.id), userId: req.currentUser.id };
    const cancelled = await requests.findOneAndUpdate({ ...owner, status: 'pending' },
      { $set: { status: 'cancelled', resolvedAt: new Date() } }, { returnDocument: 'after' });
    if (!cancelled) {
      const existing = await requests.findOne(owner);
      return res.status(existing ? 409 : 404).json({
        message: existing ? 'Only pending requests can be cancelled.' : 'Request not found.',
        ...(existing ? { request: publicRequest(existing) } : {})
      });
    }
    res.json({ message: 'Group creation request cancelled.', request: publicRequest(cancelled) });
  });
  app.post('/api/group-creation-requests', authenticated, async (req, res) => {
    const { name, description, minimumAge, colour } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80
      || typeof description !== 'string' || !description.trim() || description.trim().length > 1000
      || !Number.isInteger(minimumAge) || minimumAge < 0 || minimumAge > 120
      || typeof colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(colour)) {
      return res.status(400).json({ message: 'Enter a name (1–80 characters), description (1–1000 characters), minimum age (0–120), and a hex colour.' });
    }
    const check = eligibility({ minimumAge }, req.currentUser);
    if (!check.eligible) return res.status(403).json({ message: check.message });
    const request = {
      userId: req.currentUser.id, username: req.currentUser.username,
      name: name.trim(), normalizedName: name.trim().replace(/\s+/g, ' ').toLowerCase(),
      description: description.trim(), minimumAge, colour: colour.toLowerCase(),
      status: 'pending', createdAt: new Date()
    };
    try { await requests.insertOne(request); }
    catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'A request for this group is already pending.' });
      throw error;
    }
    res.status(201).json({ message: 'Request sent. Pending Super Admin approval.', request: publicRequest(request) });
  });
  app.get('/api/admin/group-creation-requests', authenticated, requireSuperAdmin, async (req, res) => {
    const pending = await requests.find({ status: { $in: ['pending', 'approving'] } }).sort({ createdAt: 1 }).toArray();
    // Only the username is joined; user documents and credentials never leave here.
    res.json(await Promise.all(pending.map(async request => {
      const user = await db.collection('users').findOne({ id: request.userId }, { projection: { username: 1 } });
      return { ...publicRequest(request), username: user?.username ?? request.username };
    })));
  });
  // Super Admin: view system audit logs
app.get(
  '/api/admin/audit-logs',
  authenticated,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const logs = await auditLogs
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.json(
        logs.map(log => ({
          id: log._id.toString(),
          action: log.action,
          performedBy: log.performedBy,
          performedByUsername: log.performedByUsername,
          targetType: log.targetType,
          targetId: log.targetId,
          targetName: log.targetName,
          requestedBy: log.requestedBy,
          createdAt: log.createdAt
        }))
      );
    } catch (error) {
      console.error('Unable to load audit logs:', error);

      res.status(500).json({
        message: 'Unable to load audit logs.'
      });
    }
  }
);
  for (const action of ['approve', 'reject']) {
    app.post(`/api/admin/group-creation-requests/:id/${action}`, authenticated, requireSuperAdmin, async (req, res) => {
      if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: 'Invalid request ID.' });
      const _id = new ObjectId(req.params.id);
      const existing = await requests.findOne({ _id });
      if (!existing) return res.status(404).json({ message: 'Request not found.' });
      if (action === 'reject') {
        const rejected = await requests.findOneAndUpdate({ _id, status: 'pending' },
          { $set: { status: 'rejected', resolvedAt: new Date(), reviewedBy: req.currentUser.id } }, { returnDocument: 'after' });
        if (!rejected) {
  return res.status(409).json({
    message: 'Request has already been resolved or approval has started.'
  });
}

await auditLogs.insertOne({
  action: 'GROUP_CREATION_REJECTED',
  performedBy: req.currentUser.id,
  performedByUsername: req.currentUser.username,
  targetType: 'groupCreationRequest',
  targetId: rejected._id.toString(),
  targetName: rejected.name,
  requestedBy: rejected.username,
  createdAt: new Date()
});

return res.json({
  message: 'Request rejected. No group was created.',
  request: publicRequest(rejected)
});
      }
      const user = await db.collection('users').findOne({ id: existing.userId });
      if (!user) return res.status(409).json({ message: 'The requesting user no longer exists.' });
      // Recheck age before adding membership, including after profile changes.
      const check = eligibility(existing, user);
      if (!check.eligible && existing.status === 'pending') return res.status(409).json({ message: `Cannot approve: ${check.message}` });
      let claimed = await requests.findOneAndUpdate({ _id, status: 'pending' },
        { $set: { status: 'approving', reviewedBy: req.currentUser.id } }, { returnDocument: 'after' });
      if (!claimed) claimed = await requests.findOne({ _id, status: 'approving' });
      if (!claimed) return res.status(409).json({ message: 'Request has already been resolved.' });
      // A deterministic MongoDB _id makes retries safe on standalone MongoDB.
      // Membership and group authority are inserted together in ONE document.
      const groupKey = `creation-request:${req.params.id.toLowerCase()}`;
      let group = await groups.findOne({ _id: groupKey });
      if (!group) {
        try {
          group = await insertWithNextId(groups, {
            _id: groupKey, name: claimed.name, description: claimed.description,
            minimumAge: claimed.minimumAge, colour: claimed.colour,
            memberIds: [claimed.userId], adminIds: [claimed.userId], members: [], chatRooms: []
          });
        } catch (error) {
          if (error.code !== 11000 || !error.keyPattern?._id) throw error;
          group = await groups.findOne({ _id: groupKey });
        }
      }
      const approved = await requests.findOneAndUpdate({ _id, status: 'approving' },
        { $set: { status: 'approved', groupId: group.id, resolvedAt: new Date() } }, { returnDocument: 'after' });
      if (!approved) {
  return res.status(409).json({
    message: 'Request has already been resolved.'
  });
}

await auditLogs.insertOne({
  action: 'GROUP_CREATION_APPROVED',
  performedBy: req.currentUser.id,
  performedByUsername: req.currentUser.username,
  targetType: 'group',
  targetId: String(group.id),
  targetName: approved.name,
  requestedBy: approved.username,
  createdAt: new Date()
});

res.json({
  message: 'Request approved. Group created with the requester as its initial Group Admin.',
  request: publicRequest(approved)
});

    }); // closes app.post(...)
  } // closes for loop
} // closes registerGroupCreationRequests()
