//Setting the Server

import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import { hashPassword, isBcryptHash, migratePasswords, publicUser, validCredentials } from './authentication.js';

export function createApp(db) {
const app = express();

app.use(express.json()); // Allows the Express to read what the JSON sent for the requests
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
      user: publicUser(user)
    });
  } else {
    res.json({
      success: false,
      message: 'Invalid username or password'
    });
  }
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

app.put('/api/users/:id', async (req, res) => {

  const id = Number(req.params.id);

  const user = await users.findOne({ id }, publicFields);

  if (user) {

    // As before, omitted or empty values keep the current field value.
    const changes = {};
    for (const field of ['username', 'email', 'firstName', 'lastName', 'dob']) {
      if (req.body[field]) changes[field] = req.body[field];
    }
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

//GROUP API

app.get('/api/groups', async (req, res) => {
  res.json(await groups.find({}, publicFields).sort({ id: 1 }).toArray()); //group endpoint
});

app.post('/api/groups', async (req, res) => {

  const newGroup = await insertWithNextId(groups, {
    name: req.body.name,
    description: req.body.description,
    minimumAge: req.body.minimumAge,
    admin: req.body.admin,
    members: [],
    chatRooms: []
  });

  res.json({
    success: true,
    message: 'Group created successfully',
    group: newGroup
  });

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

app.put('/api/groups/:id', async (req, res) => {

  const id = Number(req.params.id);

  const group = await groups.findOne({ id }, publicFields);

  if (group) {

    // As before, omitted or empty values keep the current field value.
    const changes = {};
    for (const field of ['name', 'description', 'minimumAge']) {
      if (req.body[field]) changes[field] = req.body[field];
    }
    const updated = await groups.findOneAndUpdate(
      { id }, { $set: changes }, { ...publicFields, returnDocument: 'after' }
    );

    res.json({
      success: true,
      message: 'Group updated successfully',
      group: updated
    });

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.delete('/api/groups/:id', async (req, res) => {

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

// POST- ADDING USER TO A GROUP
app.post('/api/groups/:groupId/members', async (req, res) => {

  const groupId = Number(req.params.groupId);
  const username = req.body.username;

  // Find the selected group using its numeric id.
  const group = await groups.findOne({ id: groupId }, publicFields);

  // Find the user using their username.
  const user = await users.findOne({ username: { $eq: username } }, publicFields);

  if (!group || !user) {
    return res.status(404).json({
      message: 'User or group not found'
    });
  }

  // $addToSet adds an array entry only if it is absent, even for concurrent joins.
  // These are two separate writes, matching the existing membership structure.
  await groups.updateOne({ id: groupId }, { $addToSet: { members: username } });
  await users.updateOne({ id: user.id }, { $addToSet: { groups: group.name } });

  res.json({
    success: true,
    message: 'User added to group successfully'
  });

});

//CHAT ROOM API
app.get('/api/groups/:groupId/rooms', async (req, res) => {

  const groupId = Number(req.params.groupId);

  const group = await groups.findOne({ id: groupId }, publicFields);

  if (group) {

    res.json(group.chatRooms);

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.post('/api/groups/:groupId/rooms', async (req, res) => {

  const groupId = Number(req.params.groupId);

  const group = await groups.findOne({ id: groupId }, publicFields);

  if (group) {

    const newRoom = req.body.name;

    // $push appends without overwriting other requests' room changes.
    await groups.updateOne({ id: groupId }, { $push: { chatRooms: newRoom } });

    res.json({
      success: true,
      message: 'Chat room created successfully',
      chatRoom: newRoom
    });

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.put('/api/groups/:groupId/rooms/:roomName', async (req, res) => {

  const groupId = Number(req.params.groupId);
  const roomName = req.params.roomName;

  const group = await groups.findOne({ id: groupId }, publicFields);

  if (!group) {
    return res.status(404).json({
      message: 'Group not found'
    });
  }

  const roomIndex = group.chatRooms.findIndex(
    room => room === roomName
  );

  if (roomIndex !== -1) {

    // The positional $ targets the first matching room, as the old array did.
    await groups.updateOne(
      { id: groupId, chatRooms: roomName },
      { $set: { 'chatRooms.$': req.body.name } }
    );

    res.json({
      success: true,
      message: 'Chat room updated successfully',
      chatRoom: req.body.name
    });

  } else {

    res.status(404).json({
      message: 'Chat room not found'
    });

  }

});

app.delete('/api/groups/:groupId/rooms/:roomName', async (req, res) => {

  const groupId = Number(req.params.groupId);
  const roomName = req.params.roomName;

  const group = await groups.findOne({ id: groupId }, publicFields);

  if (!group) {
    return res.status(404).json({
      message: 'Group not found'
    });
  }

  const roomIndex = group.chatRooms.findIndex(
    room => room === roomName
  );

  if (roomIndex !== -1) {

    // Remove only the first matching room (duplicate names were allowed before).
    // A pipeline calculates the position inside MongoDB so concurrent edits do
    // not cause us to save an outdated copy of the entire room array.
    await groups.updateOne(
      { id: groupId, chatRooms: roomName },
      [{ $set: { chatRooms: { $let: {
        vars: { index: { $indexOfArray: ['$chatRooms', { $literal: roomName }] } },
        in: { $concatArrays: [
          { $slice: ['$chatRooms', '$$index'] },
          { $slice: ['$chatRooms', { $add: ['$$index', 1] }, { $size: '$chatRooms' }] }
        ] }
      } } } }]
    );

    res.json({
      success: true,
      message: 'Chat room deleted successfully'
    });

  } else {

    res.status(404).json({
      message: 'Chat room not found'
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
}

async function startServer() {
  const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db('fabulari');
    await prepareDatabase(db);
    createApp(db).listen(3000, () => {
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
