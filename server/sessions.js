import { createHash, randomBytes } from 'node:crypto';

const tokenHash = token => createHash('sha256').update(token).digest('hex');

// DEMO: Creates a random login token with a 24-hour expiry in sessions.
export async function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  // Store only a digest, so a database session record is not a usable token.
  await db.collection('sessions').insertOne({
    _id: tokenHash(token), userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  return token;
}

// DEMO: Checks expiry and reloads the user so permissions and DOB stay current.
export async function sessionUser(db, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.collection('sessions').findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  const user = session && await db.collection('users').findOne({ id: session.userId }, { projection: { password: 0, _id: 0 } });
  return user ? { user, session } : null;
}

// DEMO: Protected APIs require a valid Bearer token; invalid sessions receive 401.
export function requireUser(db) {
  return async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const identity = await sessionUser(db, token);
    if (!identity) return res.status(401).json({ message: 'Please log in again to continue.' });
    req.currentUser = identity.user;
    req.sessionId = identity.session._id;
    next();
  };
}
