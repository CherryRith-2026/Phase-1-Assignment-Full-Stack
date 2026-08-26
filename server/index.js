import express from 'express';
import cors from 'cors';
import fs from 'fs';

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

//user API
let users = JSON.parse(
  fs.readFileSync('./users.json', 'utf8')
);

//Group API
let groups = JSON.parse(
  fs.readFileSync('./groups.json', 'utf8')
);

function saveUsers() {
  fs.writeFileSync(
    './users.json',
    JSON.stringify(users, null, 2)
  );
}

function saveGroups() {
  fs.writeFileSync(
    './groups.json',
    JSON.stringify(groups, null, 2)
  );
}

app.get('/', (req, res) => {
  res.send('Fabulari server is running!');
});

app.get('/api/users', (req, res) => {
  res.json(users);   //user endpoint
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(
    u => u.username === username && u.password === password
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
app.post('/api/users', (req, res) => {
  const newUser = {
    id: users.length + 1,
    username: req.body.username,
    email: req.body.email,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    age: req.body.age,
    password: req.body.password,
    role: 'user',
    groups: []
  };

  users.push(newUser);

  res.json({
    success: true,
    message: 'User created successfully',
    user: newUser
  });
});
app.get('/api/users/:id', (req, res) => {

  const id = Number(req.params.id);

  const user = users.find(
    u => u.id === id
  );

  if (user) {

    res.json(user);

  } else {

    res.status(404).json({
      message: 'User not found'
    });

  }

});

app.put('/api/users/:id', (req, res) => {

  const id = Number(req.params.id);

  const user = users.find(
    u => u.id === id
  );

  if (user) {

    user.username = req.body.username || user.username;
    user.email = req.body.email || user.email;
    user.firstName = req.body.firstName || user.firstName;
    user.lastName = req.body.lastName || user.lastName;
    user.age = req.body.age || user.age;
    saveUsers();

    res.json({
      success: true,
      message: 'User updated successfully',
      user: user
    });

  } else {

    res.status(404).json({
      message: 'User not found'
    });

  }

});

app.delete('/api/users/:id', (req, res) => {

  const id = Number(req.params.id);

  const userIndex = users.findIndex(
    u => u.id === id
  );

  if (userIndex !== -1) {

    users.splice(userIndex, 1);
    saveUsers();

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

app.get('/api/groups', (req, res) => {
  res.json(groups); //group endpoint
});

app.post('/api/groups', (req, res) => {

  const newGroup = {
    id: groups.length + 1,
    name: req.body.name,
    description: req.body.description,
    minimumAge: req.body.minimumAge,
    admin: req.body.admin,
    members: [],
    chatRooms: []
  };

  groups.push(newGroup);
  saveGroups();

  res.json({
    success: true,
    message: 'Group created successfully',
    group: newGroup
  });

});

app.get('/api/groups/:id', (req, res) => {

  const id = Number(req.params.id);

  const group = groups.find(
    g => g.id === id
  );

  if (group) {

    res.json(group);

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.put('/api/groups/:id', (req, res) => {

  const id = Number(req.params.id);

  const group = groups.find(
    g => g.id === id
  );

  if (group) {

    group.name = req.body.name || group.name;
    group.description = req.body.description || group.description;
    group.minimumAge = req.body.minimumAge || group.minimumAge;
    saveGroups();

    res.json({
      success: true,
      message: 'Group updated successfully',
      group: group
    });

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.delete('/api/groups/:id', (req, res) => {

  const id = Number(req.params.id);

  const groupIndex = groups.findIndex(
    g => g.id === id
  );

  if (groupIndex !== -1) {

    groups.splice(groupIndex, 1);
    saveGroups();

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

app.get('/api/groups/:groupId/rooms', (req, res) => {

  const groupId = Number(req.params.groupId);

  const group = groups.find(
    g => g.id === groupId
  );

  if (group) {

    res.json(group.chatRooms);

  } else {

    res.status(404).json({
      message: 'Group not found'
    });

  }

});

app.post('/api/groups/:groupId/rooms', (req, res) => {

  const groupId = Number(req.params.groupId);

  const group = groups.find(
    g => g.id === groupId
  );

  if (group) {

    const newRoom = req.body.name;

    group.chatRooms.push(newRoom);
    saveGroups();

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

app.put('/api/groups/:groupId/rooms/:roomName', (req, res) => {

  const groupId = Number(req.params.groupId);
  const roomName = req.params.roomName;

  const group = groups.find(
    g => g.id === groupId
  );

  if (!group) {
    return res.status(404).json({
      message: 'Group not found'
    });
  }

  const roomIndex = group.chatRooms.findIndex(
    room => room === roomName
  );

  if (roomIndex !== -1) {

    group.chatRooms[roomIndex] = req.body.name;
    saveGroups();

    res.json({
      success: true,
      message: 'Chat room updated successfully',
      chatRoom: group.chatRooms[roomIndex]
    });

  } else {

    res.status(404).json({
      message: 'Chat room not found'
    });

  }

});

app.delete('/api/groups/:groupId/rooms/:roomName', (req, res) => {

  const groupId = Number(req.params.groupId);
  const roomName = req.params.roomName;

  const group = groups.find(
    g => g.id === groupId
  );

  if (!group) {
    return res.status(404).json({
      message: 'Group not found'
    });
  }

  const roomIndex = group.chatRooms.findIndex(
    room => room === roomName
  );

  if (roomIndex !== -1) {

    group.chatRooms.splice(roomIndex, 1);
    saveGroups();

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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});