import express from 'express';

const app = express();
const port = 3000;

app.use(express.json());

//user API
const users = [
  {
    id: 1,
    username: 'Cherry',
    email: 'cherry@gmail.com',
    firstName: 'Cherry',
    lastName: 'Ry',
    age: 24,
    password: '123456',
    role: 'user',
    groups: ['Study', 'Music']
  },
  {
    id: 2,
    username: 'James',
    email: 'james@gmail.com',
    firstName: 'James',
    lastName: 'Smith',
    age: 22,
    password: '123456',
    role: 'user',
    groups: ['Study']
  }
];

//Group API

const groups = [
  {
    id: 1,
    name: 'Study',
    description: 'A group for students to study and discuss their work.',
    minimumAge: 16,
    admin: 'Cherry',
    members: ['Cherry', 'James', 'Sarah'],
    chatRooms: ['General', 'Study Time!', 'Q&A']
  },
  {
    id: 2,
    name: 'Music',
    description: 'A group for users to discuss music and share recommendations.',
    minimumAge: 16,
    admin: 'Cherry',
    members: ['Cherry', 'Sarah'],
    chatRooms: ['General', 'Music Talk', 'Song Recommendations']
  }
];


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

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});