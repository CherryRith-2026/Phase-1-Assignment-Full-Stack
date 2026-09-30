import { createServer } from 'node:http';
import { attachChat } from './chat.js';
import { registerGroupManagement } from './group-management.js';
import { registerJoinRequestReview } from './join-request-review.js';
import { registerGroupMembers } from './group-members.js';
//Setting the Server

import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { createSession, requireUser } from './sessions.js';
import { registerGroupRequests, prepareGroupRequests } from './group-requests.js';
import { registerGroupCreationRequests, prepareGroupCreationRequests, requireSuperAdmin } from './group-creation-requests.js';
import { profileChanges } from './profile-validation.js';
import { hashPassword, isBcryptHash, migratePasswords, publicUser, validCredentials } from './authentication.js';

export function createApp(db) {
const app = express();

app.use(express.json()); // Allows the Express to read what the JSON sent for the requests
app.use((req, res, next) => {
  res.on('finish', () => {
    if (req.method !== 'GET' && res.statusCode < 400) app.locals.chat?.refresh().catch(error => console.error('Chat refresh failed:', error.message));
  });
  next();
});
app.use(cors()); // Angular frontend will communicate with the server using cors

const users = db.collection('users');
const groups = db.collection('groups');

// Exclude passwords/hashes and MongoDB's internal _id from public queries.
const publicFields = { projection: { _id: 0, password: 0 } };

//Test Route in Server to check if server is running
app.get('/', (req, res) => {
  res.send('Fabulari server is running!');
});


//LOGIN API

app.post('/api/login', async (req, res) => { // POST means sending the login info to server.
  const { username, password } = req.body ?? {}; //getting the username and password from request body

  // Phase 1 allowed duplicate usernames. Check each matching account so an
  // existing account remains usable; hashes are read only for authentication.
  let user = null;
  if (validCredentials(username, password)) {
    for await (const candidate of users.find({ username: { $eq: username } })) {
      if (isBcryptHash(candidate.password) && await bcrypt.compare(password, candidate.password)) {
        user = candidate;
        break;
      }
    }
  }

  if (user) {
    res.json({
      success: true,
      message: 'Login successful',
      token: await createSession(db, user.id),
      user: publicUser(user)
    });
  } else {
    res.json({
      success: false,
      message: 'Invalid username or password'
    });
  }
});

// Revoke the current session when logging out.
app.post('/api/logout', requireUser(db), async (req, res) => {
  await db.collection('sessions').deleteOne({ _id: req.sessionId });
  res.json({ success: true });
});

//USER API
// GET = Read, POST = Create, PUT = Update, DELETE = Remove

app.get('/api/users', async (req, res) => { //get all users
  res.json(await users.find({}, publicFields).sort({ id: 1 }).toArray());   //user endpoint and send user back as JSON
});

app.post('/api/users', async (req, res) => {  //post creates new user and sends data to server
  if (!validCredentials(req.body?.username, req.body?.password)) {
    return res.status(400).json({ success: false, message: 'Username and password are required; password must be at most 72 UTF-8 bytes.' });
  }
  // bcrypt creates a random salt; only the resulting hash reaches MongoDB.
  const passwordHash = await hashPassword(req.body.password);
  const newUser = await insertWithNextId(users, { // Keep numeric ids for Angular.
    username: req.body.username,
    email: req.body.email,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    dob: req.body.dob,
    password: passwordHash,
    role: 'user',
    groups: []
  });

  res.json({
    success: true,
    message: 'User created successfully',
    user: publicUser(newUser)
  });
});


app.get('/api/users/:id', async (req, res) => { //get users by id

  const id = Number(req.params.id);

  const user = await users.findOne({ id }, publicFields);

  if (user) {

    res.json(user);

  } else {

    res.status(404).json({
      message: 'User not found'
    });

  }

});

app.put('/api/users/:id', requireUser(db), async (req, res) => {
  if (req.currentUser.id !== Number(req.params.id)) {
    return res.status(403).json({ message: 'You can only edit your own profile.' });
  }

  const id = Number(req.params.id);

  const user = await users.findOne({ id }, publicFields);

  if (user) {

    // Validate editable fields; ignore role/password/age even if submitted.
    // Omitted fields stay unchanged; optional profile fields may be cleared.
    const changes = profileChanges(req.body);
    const updated = await users.findOneAndUpdate(
      { id }, { $set: changes }, { ...publicFields, returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: 'User updated successfully',
      user: updated
    });

  } else {

    res.status(404).json({
      message: 'User not found'
    });

  }

});

app.delete('/api/users/:id', async (req, res) => {

  const id = Number(req.params.id);

  const result = await users.deleteOne({ id });

  if (result.deletedCount !== 0) {

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } else {

    res.status(404).json({
      message: 'User not found'
    });

  }

});

// Register /available before the existing /:id route.
registerGroupRequests(app, db);
registerGroupMembers(app, db);
registerGroupManagement(app, db);
registerJoinRequestReview(app, db);
registerGroupCreationRequests(app, db, insertWithNextId);

//GROUP API

app.get('/api/groups', async (req, res) => {
  res.json(await groups.find({}, publicFields).sort({ id: 1 }).toArray()); //group endpoint
});

app.post('/api/groups', requireUser(db), (req, res) => {
  res.status(403).json({ message: 'Submit a group creation request for Super Admin approval.' });
});

app.get('/api/groups/:id', async (req, res) => {

  const id = Number(req.params.id);

  const group = await groups.findOne({ id }, publicFields);

  if (group) {

    res.json(group);

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.delete('/api/groups/:id', requireUser(db), requireSuperAdmin, async (req, res) => {

  const id = Number(req.params.id);

  const result = await groups.deleteOne({ id });

  if (result.deletedCount !== 0) {

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

// Express 5 forwards rejected async route promises here.
app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  // Keep express.json()'s client-error status for malformed request bodies.
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({
    message: status === 500 ? 'An unexpected server error occurred' : error.message
  });
});

return app;
}

async function seedIfEmpty(collection, filename) {
  // Existing MongoDB data takes priority. JSON is only a startup seed source.
  if (await collection.countDocuments({}, { limit: 1 }) !== 0) return;

  // Resolve relative to this file, so starting from another directory also works.
  const records = JSON.parse(await readFile(new URL(filename, import.meta.url), 'utf8'));
  for (const record of records) {
    // Even a fresh JSON seed must never insert a plain-text password.
    if (filename === './users.json' && !isBcryptHash(record.password)) {
      record.password = await hashPassword(record.password);
    }
    // Upsert plus the unique id index prevents duplicate seed records, including
    // when two server processes happen to start at the same time.
    try {
      await collection.updateOne(
        { id: record.id }, { $setOnInsert: record }, { upsert: true }
      );
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.id) throw error;
    }
  }
}

export async function insertWithNextId(collection, fields) {
  while (true) {
    const latest = await collection.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).next();
    const record = { id: (latest?.id ?? 0) + 1, ...fields };
    try {
      // insertOne adds _id to its argument; pass a copy to keep the response clean.
      await collection.insertOne({ ...record });
      return record;
    } catch (error) {
      // Another request may have inserted this id after our read. Re-read the
      // highest id and retry. Other database failures go to the error handler.
      if (error.code !== 11000 || !error.keyPattern?.id) throw error;
    }
  }
}

export async function prepareDatabase(db) {
  const users = db.collection('users');
  await users.createIndex({ id: 1 }, { unique: true });
  await db.collection('groups').createIndex({ id: 1 }, { unique: true });
  await seedIfEmpty(users, './users.json');
  await seedIfEmpty(db.collection('groups'), './groups.json');
  // Finish the repeatable migration before accepting any login requests.
  await migratePasswords(users);
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await prepareGroupRequests(db, insertWithNextId);
  await prepareGroupCreationRequests(db);
  await db.collection('messages').createIndex({ groupId: 1, roomId: 1, _id: -1 });
}

export function createChatServer(db) {
  const app = createApp(db);
  const server = createServer(app);
  const chat = attachChat(server, db);
  app.locals.chat = chat;
  return { server, ...chat };
}

async function startServer() {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db('fabulari');
    await prepareDatabase(db);
    createChatServer(db).server.listen(3000, () => {
      console.log('Server running on http://localhost:3000 (MongoDB: fabulari)');
    });
  } catch (error) {
    console.error('Server startup failed. Check MongoDB and user password data:', error.message);
    await client.close();
    process.exitCode = 1;
  }
}

// Importing the app in integration tests must not start the real server.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
