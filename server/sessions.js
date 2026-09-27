import { createHash, randomBytes } from 'node:crypto';

const tokenHash = token => createHash('sha256').update(token).digest('hex');

export async function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  // Store only a digest, so a database session record is not a usable token.
  await db.collection('sessions').insertOne({
    _id: tokenHash(token), userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  return token;
}

export function requireUser(db) {
  return async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const session = token && await db.collection('sessions').findOne({
      _id: tokenHash(token), expiresAt: { $gt: new Date() }
    });
    // Read the current user for every request: DOB/username may have changed.
    const user = session && await db.collection('users').findOne(
      { id: session.userId }, { projection: { password: 0, _id: 0 } }
    );
    if (!user) return res.status(401).json({ message: 'Please log in again to continue.' });
    req.currentUser = user;
    req.sessionId = session._id;
    next();
  };
}
