import { requireUser } from './sessions.js';
import { isMember, isGroupAdmin } from './group-requests.js';

const validId = value =>
  /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));

// Only read fields needed for member management.
const memberFields = {
  projection: {
    _id: 0,
    id: 1,
    username: 1,
    groups: 1
  }
};

const publicMember = (group, user) => ({
  id: user.id,
  username: user.username,
  isGroupAdmin: isGroupAdmin(group, user)
});

export function registerGroupMembers(app, db) {
  const groups = db.collection('groups');
  const users = db.collection('users');
  const authenticated = requireUser(db);

  // Get all members of a group.
  // DEMO: Only group members can view members; canManage comes from the backend.
  app.get('/api/groups/:groupId/members', authenticated, async (req, res) => {
    if (!validId(req.params.groupId)) {
      return res.status(400).json({
        message: 'Invalid group ID.'
      });
    }

    const group = await groups.findOne({
      id: Number(req.params.groupId)
    });

    if (!group) {
      return res.status(404).json({
        message: 'Group not found.'
      });
    }

    if (!isMember(group, req.currentUser)) {
      return res.status(403).json({
        message: 'You are not a member of this group.'
      });
    }

    const candidates = await users
      .find(
        Array.isArray(group.adminIds)
          ? { id: { $in: group.memberIds || [] } }
          : {},
        memberFields
      )
      .sort({ id: 1 })
      .toArray();

    res.json({
      canManage: isGroupAdmin(group, req.currentUser),

      members: candidates
        .filter(user => isMember(group, user))
        .map(user => publicMember(group, user))
    });
  });

  // Promote an existing group member to Group Admin.
  app.post(
    '/api/groups/:groupId/admins/:memberId',
    authenticated,
    async (req, res) => {
      if (
        !validId(req.params.groupId) ||
        !validId(req.params.memberId)
      ) {
        return res.status(400).json({
          message: 'Invalid group or member ID.'
        });
      }

      const id = Number(req.params.groupId);
      const memberId = Number(req.params.memberId);

      while (true) {
        const group = await groups.findOne({ id });

        if (!group) {
          return res.status(404).json({
            message: 'Group not found.'
          });
        }

        if (!isGroupAdmin(group, req.currentUser)) {
          return res.status(403).json({
            message: 'Group Admin access required for this group.'
          });
        }

        const target = await users.findOne(
          { id: memberId },
          memberFields
        );

        if (!target || !isMember(group, target)) {
          return res.status(409).json({
            message:
              'Only an existing member of this group can be made Group Admin.'
          });
        }

        let updated;

        if (Array.isArray(group.adminIds)) {
          // Actor and target must both still be members.
          updated = await groups.findOneAndUpdate(
            {
              id,
              memberIds: {
                $all: [req.currentUser.id, memberId]
              },
              adminIds: req.currentUser.id
            },
            {
              $addToSet: {
                // DEMO: Promotion adds the selected member's ID to this group's adminIds.
                adminIds: memberId
              }
            },
            {
              returnDocument: 'after'
            }
          );
        } else {
          // Convert legacy membership/admin data to ID arrays.
          const candidates = await users
            .find({}, memberFields)
            .toArray();

          const members = candidates.filter(user =>
            isMember(group, user)
          );

          const snapshot = { id };

          for (const field of [
            'name',
            'admin',
            'adminIds',
            'memberIds',
            'members',
            'leftMemberIds'
          ]) {
            snapshot[field] = Object.hasOwn(group, field)
              ? { $eq: group[field] }
              : { $exists: false };
          }

          if (!members.some(user => user.id === memberId)) {
            continue;
          }

          updated = await groups.findOneAndUpdate(
            snapshot,
            {
              $set: {
                memberIds: [
                  ...new Set(members.map(user => user.id))
                ],

                adminIds: [
                  ...new Set([
                    ...members
                      .filter(user => isGroupAdmin(group, user))
                      .map(user => user.id),

                    memberId
                  ])
                ]
              }
            },
            {
              returnDocument: 'after'
            }
          );
        }

        if (!updated) {
          continue;
        }

        return res.json({
          message: 'Member is now a Group Admin.',
          member: publicMember(updated, target)
        });
      }
    }
  );

  // Demote a Group Admin back to a standard group member.
  // The member remains in memberIds.
  app.delete(
    '/api/groups/:groupId/admins/:memberId',
    authenticated,
    async (req, res) => {
      if (
        !validId(req.params.groupId) ||
        !validId(req.params.memberId)
      ) {
        return res.status(400).json({
          message: 'Invalid group or member ID.'
        });
      }

      const id = Number(req.params.groupId);
      const memberId = Number(req.params.memberId);

      while (true) {
        const group = await groups.findOne({ id });

        if (!group) {
          return res.status(404).json({
            message: 'Group not found.'
          });
        }

        if (!isGroupAdmin(group, req.currentUser)) {
          return res.status(403).json({
            message:
              'Group Admin access required for this group.'
          });
        }

        const target = await users.findOne(
          { id: memberId },
          memberFields
        );

        if (!target || !isMember(group, target)) {
          return res.status(409).json({
            message:
              'The selected user is not a member of this group.'
          });
        }

        if (!Array.isArray(group.adminIds)) {
          return res.status(409).json({
            message:
              'Promote another member before changing Group Admin roles.'
          });
        }

        if (!group.adminIds.includes(memberId)) {
          return res.status(409).json({
            message: 'This member is not a Group Admin.'
          });
        }

        // A group must always retain at least one Group Admin.
        // DEMO: Rejects demotion when the group has only one admin.
        if (group.adminIds.length <= 1) {
          return res.status(409).json({
            message:
              'Promote another member to Group Admin before demoting the last Group Admin.'
          });
        }

        const updated = await groups.findOneAndUpdate(
          {
            id,

            // Both users must still belong to the group.
            memberIds: {
              $all: [req.currentUser.id, memberId]
            },

            // Both must still be admins when this write occurs.
            adminIds: {
              $all: [req.currentUser.id, memberId]
            }
          },
          {
            // IMPORTANT:
            // Only remove Group Admin authority.
            // Do NOT remove memberId from memberIds.
            // DEMO: Demotion removes only adminIds; memberIds keeps the user as a Member.
            $pull: {
              adminIds: memberId
            }
          },
          {
            returnDocument: 'after'
          }
        );

        if (!updated) {
          continue;
        }

        return res.json({
          message:
            'Group Admin demoted to a standard member.',
          member: publicMember(updated, target)
        });
      }
    }
  );
}