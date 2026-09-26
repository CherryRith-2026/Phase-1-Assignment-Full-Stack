import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';
import { hashPassword, publicUser, validCredentials } from './authentication.js';
import { insertWithNextId, prepareDatabase } from './index.js';

export async function bootstrapSuperAdmin(db, username, password) {
  const users = db.collection('users');
  if (await users.findOne({ role: 'superAdmin' })) {
    throw new Error('A Super Admin already exists. Bootstrap refused.');
  }
  if (!validCredentials(username, password)) {
    throw new Error('Set SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD (password: 1–72 UTF-8 bytes).');
  }
  if (await users.findOne({ username: { $eq: username } })) {
    throw new Error('Username already belongs to a user. Choose a different username; users are never promoted.');
  }
  const passwordHash = await hashPassword(password);
  // MongoDB's unique _id makes this one-time reservation atomic, even if two
  // commands run together. Keep it permanently, even if the admin is deleted.
  try {
    await db.collection('bootstrap').insertOne({ _id: 'initial-super-admin' });
  } catch (error) {
    if (error.code === 11000) throw new Error('Super Admin bootstrap was already used or reserved.');
    throw error;
  }
  // Fail closed after reserving: a database failure must not permit a second
  // bootstrap. See STAGE1B.md for recovery after an interrupted command.
  return publicUser(await insertWithNextId(users, {
    username, password: passwordHash, role: 'superAdmin',
    email: '', firstName: '', lastName: '', dob: '', groups: []
  }));
}

async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db('fabulari');
    await prepareDatabase(db);
    await bootstrapSuperAdmin(db, process.env.SUPER_ADMIN_USERNAME, process.env.SUPER_ADMIN_PASSWORD);
    console.log('Initial Super Admin created. Sign in using the existing login page.');
  } catch (error) {
    console.error('Bootstrap failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
