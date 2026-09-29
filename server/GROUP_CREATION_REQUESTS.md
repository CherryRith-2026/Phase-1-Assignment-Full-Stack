# Group creation requests

Restart the Express server to create the new MongoDB index. No JSON changes,
new dependencies, or MongoDB replica set are needed.

From Home, use **Request a New Group / My Requests**. Enter a title, description,
minimum age and colour. The requester's stored DOB must meet the proposed age
restriction, checked again before approval. History displays pending, approved
and rejected outcomes; refresh to fetch decisions made in another session.

The Super Admin's Home shows **Review Group Requests**. Express checks the
session's current MongoDB user role on every review/list/approve/reject call.
Browser roles and submitted user identifiers grant no permissions.

## Persistence and authority

`groupCreationRequests` stores an ObjectId, session-derived `userId`, username
snapshot, name, normalizedName, description, minimumAge, colour, status and
createdAt. Decisions add reviewedBy and resolvedAt; approval adds groupId.
A partial unique index on `(userId, normalizedName)` prevents duplicate active
requests (pending or approving), including concurrent submissions. Names are
trimmed, whitespace-normalized and lowercased for duplicate detection.

Approval creates a numeric-ID document in `groups`. `memberIds: [userId]` and
`adminIds: [userId]` represent membership and Group Admin authority for that
specific group. The user document/global role is unchanged. My Groups uses these
IDs, survives username changes and displays a Group Admin badge. Legacy groups
retain their existing membership compatibility. Same-name groups do not inherit
memberships from each other.

Standalone MongoDB cannot atomically update two collections. Approval first
atomically changes pending to approving, inserts the group with membership and
admin IDs together, then marks the request approved. A deterministic group `_id`
prevents duplicate groups on concurrent calls or retry. An interrupted approval
remains visible as approving: refresh the review page and use **Retry Approval**.
The group may already be visible in My Groups during this intermediate state.
Reject only matches pending, so it cannot reverse an approval in progress.
Already resolved requests return HTTP 409.

The old direct group-create API returns 403 and points callers to this workflow.
Legacy group update/delete APIs now require an authenticated Super Admin.
No Group Admin management actions, join decisions or chat changes are included.

## Manual demonstration

1. Start MongoDB, Express and Angular. Sign in as User1 with a DOB at least 15
   years ago. Request `group1`, minimum age 15, a description and a colour.
2. Verify pending history and absence from My Groups before approval.
3. In another browser session, sign in as Super Admin, open Review Group
   Requests, verify User1/details and approve.
4. Return to User1, refresh request history, then navigate Home. Verify `group1`
   and the Group Admin badge. User1's global role remains user.
5. Submit a different request and reject it as Super Admin. Refresh User1's
   history to see rejected; verify no corresponding group appears.

Automated verification: `npm test --prefix server`,
`npm test --prefix client -- --watch=false`, and `npm run build --prefix client`.
Backend tests launch a separate temporary mongod and never use the live database.
