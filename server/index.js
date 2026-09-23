//Setting the Server

import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const app = express();
const port = 3000;


app.use(express.json()); // Allows the Express to read what the JSON sent for the requests
app.use(cors()); // Angular frontend will communicate with the server using cors

// MongoClient manages the connection pool used by all requests.
// Select only fabulari: the existing mydb database is never used.
const client = new MongoClient('mongodb://127.0.0.1:27017', {
  serverSelectionTimeoutMS: 5000
});
const db = client.db('fabulari');
const users = db.collection('users');
const groups = db.collection('groups');

// Keep MongoDB's internal _id out of responses so Angular receives the old shape.
const publicFields = { projection: { _id: 0 } };

async function seedIfEmpty(collection, filename) {
  // Existing MongoDB data takes priority. JSON is only a startup seed source.
  if (await collection.countDocuments({}, { limit: 1 }) !== 0) return;

  // Resolve relative to this file, so starting from another directory also works.
  const records = JSON.parse(await readFile(new URL(filename, import.meta.url), 'utf8'));
  for (const record of records) {
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

async function insertWithNextId(collection, fields) {
  while (true) {
    const latest = await collection.find({}, publicFields).sort({ id: -1 }).limit(1).next();
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

//Test Route in Server to check if server is running
app.get('/', (req, res) => {
  res.send('Fabulari server is running!');
});


//LOGIN API

app.post('/api/login', async (req, res) => { // POST means sending the login info to server.
  const { username, password } = req.body; //getting the username and password from request body

  const user = await users.findOne(
    { username: { $eq: username }, password: { $eq: password } }, publicFields
  );

  if (user) {
    res.json({
      success: true,
      message: 'Login successful',
      user: user
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
  const newUser = await insertWithNextId(users, { // Keep numeric ids for Angular.
    username: req.body.username,
    email: req.body.email,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    dob: req.body.dob,
    password: req.body.password,
    role: 'user',
    groups: []
  });

  res.json({
    success: true,
    message: 'User created successfully',
    user: newUser
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

async function startServer() {
  try {
    await client.connect();
    // Unique indexes enforce numeric-id uniqueness, including concurrent creates.
    await users.createIndex({ id: 1 }, { unique: true });
    await groups.createIndex({ id: 1 }, { unique: true });
    await seedIfEmpty(users, './users.json');
    await seedIfEmpty(groups, './groups.json');

    // Accept requests only after the database and seed data are ready.
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port} (MongoDB: fabulari)`);
    });
  } catch (error) {
    console.error('Server startup failed. Check that MongoDB is running:', error);
    await client.close();
    process.exitCode = 1;
  }
}

startServer();
