import { ObjectId } from 'mongodb';
import { calculateAge } from '../shared/age.mjs';
import { requireUser } from './sessions.js';
import { eligibility, isGroupAdmin } from './group-requests.js';

export function registerJoinRequestReview(app, db) {
  const groups = db.collection('groups');
  const requests = db.collection('joinRequests');
  const users = db.collection('users');
  // DEMO: Every review route checks the session and this group's admin permission.
  const authorized = [requireUser(db), async (req, res, next) => {
    const id = Number(req.params.groupId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid group ID.' });
    const group = await groups.findOne({ id });
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (!isGroupAdmin(group, req.currentUser)) return res.status(403).json({ message: 'Group Admin access required for this group.' });
    req.reviewGroup = group;
    next();
  }];
  app.get('/api/groups/:groupId/join-requests', ...authorized, async (req, res) => {
    const pending = await requests.find({ groupId: req.reviewGroup.id, status: { $in: ['pending', 'approving'] } }).sort({ createdAt: 1 }).toArray();
    res.json(await Promise.all(pending.map(async request => {
      const user = await users.findOne({ id: request.userId }, { projection: { username: 1, firstName: 1, lastName: 1, dob: 1 } });
      return { id: request._id.toString(), userId: request.userId, status: request.status,
        username: user?.username ?? 'Deleted user', firstName: user?.firstName || '', lastName: user?.lastName || '',
        age: calculateAge(user?.dob), createdAt: request.createdAt };
    })));
  });
  for (const action of ['approve', 'reject']) {
    app.post(`/api/groups/:groupId/join-requests/:requestId/${action}`, ...authorized, async (req, res) => {
      if (!/^[a-f0-9]{24}$/i.test(req.params.requestId)) return res.status(400).json({ message: 'Invalid request ID.' });
      const key = { _id: new ObjectId(req.params.requestId), groupId: req.reviewGroup.id };
      const existing = await requests.findOne(key);
      if (!existing) return res.status(404).json({ message: 'Join request not found in this group.' });
      // DEMO: Rejection changes request status without adding a group member.
      if (action === 'reject') {
        const result = await requests.updateOne({ ...key, status: 'pending' }, { $set: {
          status: 'rejected', reviewedBy: req.currentUser.id, resolvedAt: new Date()
        } });
        if (!result.modifiedCount) return res.status(409).json({ message: 'Request is already processed or approval has started.' });
        return res.json({ message: 'Join request rejected.', status: 'rejected' });
      }
      if (!['pending', 'approving'].includes(existing.status)) return res.status(409).json({ message: 'Request has already been processed.' });
      const target = await users.findOne({ id: existing.userId }, { projection: { id: 1, dob: 1 } });
      if (!target) return res.status(409).json({ message: 'The requesting user no longer exists.' });
      const receipt = existing._id.toString();
      if (!req.reviewGroup.approvedJoinRequestIds?.includes(receipt)) {
        const check = eligibility(req.reviewGroup, target);
        if (!check.eligible) return res.status(409).json({ message: check.message });
      }
      // Claim before changing membership. Cancellation/rejection can only match pending.
      let claimed = await requests.findOneAndUpdate({ ...key, status: 'pending' },
        { $set: { status: 'approving', reviewedBy: req.currentUser.id } }, { returnDocument: 'after' });
      if (!claimed) claimed = await requests.findOne({ ...key, status: 'approving' });
      if (!claimed) return res.status(409).json({ message: 'Request has already been processed.' });
      while (true) {
        const group = await groups.findOne({ id: key.groupId });
        if (!group || !isGroupAdmin(group, req.currentUser)) return res.status(403).json({ message: 'Group Admin access required for this group.' });
        // Receipt and membership are written together. A retry cannot re-add a
        // member who left after the first write, even after a server restart.
        if (group.approvedJoinRequestIds?.includes(receipt)) break;
        const check = eligibility(group, target);
        if (!check.eligible) return res.status(409).json({ message: check.message });
        const filter = { id: group.id, approvedJoinRequestIds: { $ne: receipt } };
        if (Array.isArray(group.adminIds)) {
          filter.adminIds = req.currentUser.id;
          filter.memberIds = req.currentUser.id;
        } else {
          for (const field of ['name', 'admin', 'adminIds', 'memberIds', 'members', 'leftMemberIds']) {
            filter[field] = Object.hasOwn(group, field) ? { $eq: group[field] } : { $exists: false };
          }
        }
        const added = await groups.updateOne(filter, {
          // DEMO: Approval adds the requester to memberIds as a regular Member.
          $addToSet: { memberIds: target.id, approvedJoinRequestIds: receipt },
          $pull: { leftMemberIds: target.id }
        });
        if (added.modifiedCount) break;
      }
      const resolved = await requests.updateOne({ ...key, status: 'approving' }, { $set: { status: 'approved', resolvedAt: new Date() } });
      if (!resolved.modifiedCount) return res.status(409).json({ message: 'Request has already been processed.' });
      res.json({ message: 'Join request approved. Member added.', status: 'approved' });
    });
  }
}
