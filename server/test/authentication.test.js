import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { createSession } from '../sessions.js';
import { eligibility, groupMinimumAges } from '../group-requests.js';
import { createApp, prepareDatabase } from '../index.js';
import { bootstrapSuperAdmin } from '../bootstrap-super-admin.js';
import { isBcryptHash, migratePasswords } from '../authentication.js';

let directory, mongod, client, db, server, base;
before(async () => {
  // A separate MongoDB process protects the project's real fabulari database.
  directory = await mkdtemp(join(tmpdir(), 'fabulari-auth-test-'));
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  mongod = spawn('mongod', ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--logpath', join(directory, 'mongo.log')], { stdio: 'ignore' });
  await once(mongod, 'spawn');
  client = new MongoClient(`mongodb://127.0.0.1:${port}`, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  db = client.db('fabulari');
  await db.collection('users').insertOne({ id: 1, username: 'legacy', password: 'old-password', role: 'user', groups: [] });
  await prepareDatabase(db);
  server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (client) await client.close();
  if (mongod && mongod.exitCode === null) {
    const stopped = once(mongod, 'exit');
    mongod.kill('SIGTERM');
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function request(path, body, method = 'POST', token) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
}
function safe(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.hasOwn(value, 'password'), false);
  assert.equal(Object.hasOwn(value, 'passwordHash'), false);
  for (const child of Object.values(value)) safe(child);
}

test('1. Existing user logs in after migration; reruns preserve existing hashes', async () => {
  const users = db.collection('users');
  const first = await users.findOne({ username: 'legacy' });
  assert.ok(isBcryptHash(first.password));
  await migratePasswords(users);
  assert.equal((await users.findOne({ username: 'legacy' })).password, first.password);
  const result = await request('/api/login', { username: 'legacy', password: 'old-password' });
  assert.equal(result.body.success, true);
  assert.equal(result.body.user.role, 'user');
  safe(result.body);
});
test('2. Signup stores bcrypt and cannot request superAdmin role', async () => {
  const result = await request('/api/users', { username: 'new-user', password: 'new-password', role: 'superAdmin' });
  assert.equal(result.body.success, true);
  safe(result.body);
  const stored = await db.collection('users').findOne({ username: 'new-user' });
  assert.ok(isBcryptHash(stored.password));
  assert.ok(await bcrypt.compare('new-password', stored.password));
  assert.equal(stored.role, 'user');
});
test('3. Correct password logs in', async () => {
  assert.equal((await request('/api/login', { username: 'new-user', password: 'new-password' })).body.success, true);
});
test('4. Wrong password and malformed credentials are rejected', async () => {
  for (const password of ['wrong-password', { $ne: null }, null]) {
    const result = await request('/api/login', { username: 'new-user', password });
    assert.equal(result.body.success, false);
    safe(result.body);
  }
});
test('5. Initial Super Admin is created with bcrypt; normal users are never promoted', async () => {
  await assert.rejects(bootstrapSuperAdmin(db, 'legacy', 'admin-password'), /already belongs/);
  assert.equal((await db.collection('users').findOne({ username: 'legacy' })).role, 'user');
  const admin = await bootstrapSuperAdmin(db, 'admin', 'admin-password');
  safe(admin);
  const stored = await db.collection('users').findOne({ username: 'admin' });
  assert.ok(isBcryptHash(stored.password));
  assert.ok(await bcrypt.compare('admin-password', stored.password));
});
test('6. A second initial Super Admin is refused', async () => {
  await assert.rejects(bootstrapSuperAdmin(db, 'second-admin', 'other-password'), /already exists/);
  assert.equal(await db.collection('users').countDocuments({ role: 'superAdmin' }), 1);
});
test('7. Super Admin uses normal login and receives superAdmin role', async () => {
  const result = await request('/api/login', { username: 'admin', password: 'admin-password' });
  assert.equal(result.body.success, true);
  assert.equal(result.body.user.role, 'superAdmin');
  safe(result.body);
});
test('8. User list, profile read/update, signup and login never expose passwords', async () => {
  const users = await request('/api/users', undefined, 'GET');
  safe(users.body);
  for (const user of users.body) {
    safe((await request(`/api/users/${user.id}`, undefined, 'GET')).body);
    safe((await request(`/api/users/${user.id}`, { firstName: 'Updated', role: 'superAdmin', password: 'replacement' }, 'PUT', await createSession(db, user.id))).body);
  }
  assert.equal((await db.collection('users').findOne({ username: 'legacy' })).role, 'user');
});
test('Bootstrap reservation prevents concurrent creation and reuse after deletion', async () => {
  const isolated = client.db('bootstrap_concurrency_test');
  await isolated.collection('users').createIndex({ id: 1 }, { unique: true });
  const outcomes = await Promise.allSettled([
    bootstrapSuperAdmin(isolated, 'admin-a', 'secret-a'),
    bootstrapSuperAdmin(isolated, 'admin-b', 'secret-b')
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await isolated.collection('users').countDocuments({ role: 'superAdmin' }), 1);
  await isolated.collection('users').deleteMany({});
  await assert.rejects(bootstrapSuperAdmin(isolated, 'admin-c', 'secret-c'), /already used or reserved/);
});
test('Signup rejects invalid and overlong passwords without inserting users', async () => {
  for (const password of ['', { $gt: '' }, 'é'.repeat(37)]) {
    assert.equal((await request('/api/users', { username: 'invalid', password })).status, 400);
  }
  assert.equal(await db.collection('users').countDocuments({ username: 'invalid' }), 0);
});
test('Fresh JSON seeds are hashed and repeat startup preserves hashes', async () => {
  const seeded = client.db('fresh_seed_test');
  await prepareDatabase(seeded);
  const first = await seeded.collection('users').find({}).toArray();
  assert.ok(first.length > 0);
  assert.ok(first.every(user => isBcryptHash(user.password)));
  await prepareDatabase(seeded);
  const second = await seeded.collection('users').find({}).toArray();
  assert.deepEqual(second, first);
});

test('Legacy duplicate usernames can each authenticate with their own password', async () => {
  await db.collection('users').insertMany([
    { id: 100, username: 'duplicate', password: 'first-password', role: 'user' },
    { id: 101, username: 'duplicate', password: 'second-password', role: 'user' }
  ]);
  await migratePasswords(db.collection('users'));
  for (const [password, id] of [['first-password', 100], ['second-password', 101]]) {
    const result = await request('/api/login', { username: 'duplicate', password });
    assert.equal(result.body.user.id, id);
    safe(result.body);
  }
});

test('Profile edits persist in MongoDB and fresh GETs without changing role/password or storing age', async () => {
  const before = await db.collection('users').findOne({ username: 'new-user' });
  const changes = {
    username: 'updated-user', firstName: 'Alice', lastName: 'Smith',
    email: 'alice@example.com', dob: '2000-09-27',
    role: 'superAdmin', password: 'unwanted-change', age: 99
  };
  const saved = await request(`/api/users/${before.id}`, changes, 'PUT', await createSession(db, before.id));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.success, true);
  safe(saved.body);
  const stored = await db.collection('users').findOne({ id: before.id });
  for (const field of ['username', 'firstName', 'lastName', 'email', 'dob']) {
    assert.equal(stored[field], changes[field]);
  }
  assert.equal(stored.role, before.role);
  assert.equal(stored.password, before.password);
  assert.equal(Object.hasOwn(stored, 'age'), false);
  const refreshed = await request(`/api/users/${before.id}`, undefined, 'GET');
  assert.deepEqual(refreshed.body, saved.body.user);
  safe(refreshed.body);
  assert.equal((await request('/api/login', { username: 'updated-user', password: 'new-password' })).body.success, true);
  const admin = await request('/api/login', { username: 'admin', password: 'admin-password' });
  assert.equal(admin.body.success, true);
  assert.equal(admin.body.user.role, 'superAdmin');
  safe(admin.body);
});
test('Invalid profile input is rejected without altering MongoDB; optional fields can be cleared', async () => {
  const before = await db.collection('users').findOne({ username: 'updated-user' });
  for (const changes of [
    { dob: '2001-02-29' }, { dob: '2999-01-01' }, { dob: 'invalid' },
    { username: '  ' }, { email: 'not-an-email' }, { firstName: { $ne: null } }
  ]) {
    const response = await request(`/api/users/${before.id}`, changes, 'PUT', await createSession(db, before.id));
    assert.equal(response.status, 400);
    assert.deepEqual(await db.collection('users').findOne({ id: before.id }), before);
  }
  const cleared = await request(`/api/users/${before.id}`, { dob: '', lastName: '' }, 'PUT', await createSession(db, before.id));
  assert.equal(cleared.body.user.dob, '');
  assert.equal(cleared.body.user.lastName, '');
  safe(cleared.body);
});

let adult, adultToken, child, childToken, restrictedId;
test('Browse data comes from MongoDB; default groups are added once without overwriting existing groups', async () => {
  const names = ['Exam Revision', 'Shopping', 'Suppliers', 'Gift Ideas', 'Vacation Trips', 'Flowers and Plants'];
  await db.collection('groups').updateOne({ name: 'Shopping' }, { $set: { description: 'Existing custom description', minimumAge: 21 } });
  await Promise.all([prepareDatabase(db), prepareDatabase(db)]);
  for (const name of names) assert.equal(await db.collection('groups').countDocuments({ name }), 1);
  assert.equal((await db.collection('groups').findOne({ name: 'Shopping' })).minimumAge, 16);
  assert.equal((await db.collection('groups').findOne({ name: 'Shopping' })).description, 'Existing custom description');
  // Keep testing that eligibility reads MongoDB, not just the default mapping.
  await db.collection('groups').updateOne({ name: 'Shopping' }, { $set: { minimumAge: 21 } });
  assert.ok(await db.collection('groups').findOne({ name: 'Study' }));
  adult = (await request('/api/users', { username: 'join-adult', password: 'join-password', dob: '1990-01-01' })).body.user;
  adultToken = (await request('/api/login', { username: 'join-adult', password: 'join-password' })).body.token;
  child = (await request('/api/users', { username: 'join-child', password: 'child-password', dob: '2020-01-01' })).body.user;
  childToken = (await request('/api/login', { username: 'join-child', password: 'child-password' })).body.token;
  const response = await request('/api/groups/available', undefined, 'GET', adultToken);
  const shopping = response.body.find(group => group.name === 'Shopping');
  assert.equal(shopping.description, 'Existing custom description');
  assert.equal(shopping.joinState, 'available');
  restrictedId = shopping.id;
  safe(response.body);
});
test('My Groups returns only stored memberships for the authenticated user', async () => {
  const study = await db.collection('groups').findOne({ name: 'Study' });
  await db.collection('groups').updateOne({ id: study.id }, { $addToSet: { members: adult.username } });
  const mine = await request('/api/my/groups', undefined, 'GET', adultToken);
  assert.deepEqual(mine.body.map(group => group.id), [study.id]);
  const others = await request('/api/my/groups', undefined, 'GET', childToken);
  assert.deepEqual(others.body, []);
  const browse = await request('/api/groups/available', undefined, 'GET', adultToken);
  assert.equal(browse.body.find(group => group.id === study.id).joinState, 'member');
});
test('Eligible users create pending requests without changing members, user groups, role or age', async () => {
  const beforeUser = await db.collection('users').findOne({ id: adult.id });
  const beforeGroup = await db.collection('groups').findOne({ id: restrictedId });
  const response = await request(`/api/groups/${restrictedId}/join-requests`, { userId: child.id, role: 'superAdmin', status: 'approved' }, 'POST', adultToken);
  assert.equal(response.status, 201);
  assert.equal(response.body.joinState, 'pending');
  const stored = await db.collection('joinRequests').findOne({ groupId: restrictedId, userId: adult.id });
  assert.equal(stored.status, 'pending');
  assert.ok(stored.createdAt instanceof Date);
  assert.equal(Object.hasOwn(stored, 'age'), false);
  assert.deepEqual(await db.collection('users').findOne({ id: adult.id }), beforeUser);
  assert.deepEqual(await db.collection('groups').findOne({ id: restrictedId }), beforeGroup);
  safe(response.body);
  // A fresh HTTP read still sees the persisted request.
  const refreshed = await request('/api/groups/available', undefined, 'GET', adultToken);
  assert.equal(refreshed.body.find(group => group.id === restrictedId).joinState, 'pending');
});
test('Duplicate pending requests are rejected, including concurrent submissions', async () => {
  assert.equal((await request(`/api/groups/${restrictedId}/join-requests`, {}, 'POST', adultToken)).status, 409);
  const group = await db.collection('groups').findOne({ name: 'Gift Ideas' });
  const results = await Promise.all([
    request(`/api/groups/${group.id}/join-requests`, {}, 'POST', adultToken),
    request(`/api/groups/${group.id}/join-requests`, {}, 'POST', adultToken)
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: adult.id, groupId: group.id }), 1);
});
test('Existing members cannot request again', async () => {
  const study = await db.collection('groups').findOne({ name: 'Study' });
  const result = await request(`/api/groups/${study.id}/join-requests`, {}, 'POST', adultToken);
  assert.equal(result.status, 409);
  assert.equal(result.body.joinState, 'member');
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: adult.id, groupId: study.id }), 0);
});
test('Underage users cannot spoof age, DOB, role or another user identity', async () => {
  const result = await request(`/api/groups/${restrictedId}/join-requests`, {
    age: 100, dob: '1900-01-01', role: 'superAdmin', username: adult.username, userId: adult.id
  }, 'POST', childToken);
  assert.equal(result.status, 403);
  assert.match(result.body.message, /21/);
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: child.id }), 0);
  const browse = await request('/api/groups/available', undefined, 'GET', childToken);
  assert.equal(browse.body.find(group => group.id === restrictedId).joinState, 'ineligible');
});
test('Eligibility uses the shared birthday calculation and handles missing or invalid DOB', () => {
  const group = { minimumAge: 18 };
  assert.equal(eligibility(group, { dob: '2008-09-28' }, new Date(2026, 8, 27)).eligible, false);
  assert.equal(eligibility(group, { dob: '2008-09-28' }, new Date(2026, 8, 28)).eligible, true);
  assert.equal(eligibility(group, { dob: '2008-09-28' }, new Date(2026, 8, 29)).eligible, true);
  for (const dob of ['', 'invalid', '2001-02-29', '2999-01-01']) assert.equal(eligibility(group, { dob }).eligible, false);
  assert.equal(eligibility({ minimumAge: 0 }, {}).eligible, true);
  assert.equal(eligibility({ minimumAge: 'invalid' }, { dob: '1990-01-01' }).eligible, false);
});
test('Join eligibility reads updated MongoDB DOB even with an older login token', async () => {
  const updated = await request(`/api/users/${child.id}`, { dob: '1990-01-01' }, 'PUT', childToken);
  assert.equal(updated.status, 200);
  const result = await request(`/api/groups/${restrictedId}/join-requests`, {}, 'POST', childToken);
  assert.equal(result.status, 201);
});
test('The old members endpoint creates a pending request and never immediately joins', async () => {
  const group = await db.collection('groups').findOne({ name: 'Vacation Trips' });
  const result = await request(`/api/groups/${group.id}/members`, { username: adult.username }, 'POST', adultToken);
  assert.equal(result.status, 201);
  assert.equal(result.body.joinState, 'pending');
  assert.deepEqual((await db.collection('groups').findOne({ id: group.id })).members, []);
});
test('Missing, forged, expired and revoked sessions cannot submit requests or edit other profiles', async () => {
  for (const token of [undefined, 'a'.repeat(64)]) {
    assert.equal((await request(`/api/groups/${restrictedId}/join-requests`, { userId: adult.id }, 'POST', token)).status, 401);
    assert.equal((await request('/api/my/groups', undefined, 'GET', token)).status, 401);
  }
  assert.equal((await request(`/api/users/${adult.id}`, { dob: '1900-01-01' }, 'PUT', childToken)).status, 403);
  assert.equal((await request(`/api/users/${adult.id}`, { dob: '1900-01-01' }, 'PUT')).status, 401);
  const expired = await createSession(db, adult.id);
  const { createHash } = await import('node:crypto');
  await db.collection('sessions').updateOne({ _id: createHash('sha256').update(expired).digest('hex') }, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request('/api/groups/available', undefined, 'GET', expired)).status, 401);
  const revocable = await createSession(db, adult.id);
  assert.equal((await request('/api/logout', {}, 'POST', revocable)).status, 200);
  assert.equal((await request('/api/groups/available', undefined, 'GET', revocable)).status, 401);
});

test('Cancellation removes only the session owner pending request and allows requesting again', async () => {
  const beforeUser = await db.collection('users').findOne({ id: adult.id });
  const beforeGroup = await db.collection('groups').findOne({ id: restrictedId });
  const otherRequest = await db.collection('joinRequests').findOne({ userId: child.id, groupId: restrictedId });
  const result = await request(`/api/groups/${restrictedId}/join-requests`, { userId: child.id, username: child.username }, 'DELETE', adultToken);
  assert.equal(result.status, 200);
  assert.equal(result.body.joinState, 'available');
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: adult.id, groupId: restrictedId }), 0);
  assert.deepEqual(await db.collection('joinRequests').findOne({ _id: otherRequest._id }), otherRequest);
  assert.deepEqual(await db.collection('users').findOne({ id: adult.id }), beforeUser);
  assert.deepEqual(await db.collection('groups').findOne({ id: restrictedId }), beforeGroup);
  const browse = await request('/api/groups/available', undefined, 'GET', adultToken);
  assert.equal(browse.body.find(group => group.id === restrictedId).joinState, 'available');
  assert.equal((await request(`/api/groups/${restrictedId}/join-requests`, {}, 'POST', adultToken)).status, 201);
});
test('Cancellation without a pending request returns 404 and cannot target another user', async () => {
  const group = await db.collection('groups').findOne({ name: 'Vacation Trips' });
  const before = await db.collection('joinRequests').findOne({ userId: adult.id, groupId: group.id });
  assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'DELETE')).status, 401);
  const result = await request(`/api/groups/${group.id}/join-requests`, { userId: adult.id }, 'DELETE', childToken);
  assert.equal(result.status, 404);
  assert.match(result.body.message, /No pending request/);
  assert.deepEqual(await db.collection('joinRequests').findOne({ _id: before._id }), before);
});
test('Cancellation preserves approved requests and current group membership', async () => {
  const group = await db.collection('groups').findOne({ name: 'Study' });
  await db.collection('joinRequests').insertOne({ userId: adult.id, groupId: group.id, status: 'approved' });
  const beforeGroup = await db.collection('groups').findOne({ id: group.id });
  const result = await request(`/api/groups/${group.id}/join-requests`, {}, 'DELETE', adultToken);
  assert.equal(result.status, 409);
  assert.equal(result.body.joinState, 'member');
  assert.deepEqual(await db.collection('groups').findOne({ id: group.id }), beforeGroup);
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: adult.id, groupId: group.id, status: 'approved' }), 1);
  // A non-member with a non-pending historical request cannot delete it either.
  await db.collection('joinRequests').insertOne({ userId: child.id, groupId: group.id, status: 'approved' });
  assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'DELETE', childToken)).status, 404);
  assert.equal(await db.collection('joinRequests').countDocuments({ userId: child.id, groupId: group.id, status: 'approved' }), 1);
});

test('Minimum-age setup stores all eight limits without changing memberships, requests or other group fields', async () => {
  const beforeGroups = await db.collection('groups').find({}).sort({ id: 1 }).toArray();
  const beforeRequests = await db.collection('joinRequests').find({}).toArray();
  const beforeUsers = await db.collection('users').find({}).toArray();
  await prepareDatabase(db);
  await prepareDatabase(db);
  const afterGroups = await db.collection('groups').find({}).sort({ id: 1 }).toArray();
  assert.equal(afterGroups.length, beforeGroups.length);
  for (const before of beforeGroups) {
    const after = afterGroups.find(group => group.id === before.id);
    assert.deepEqual(after, { ...before, minimumAge: groupMinimumAges[before.name] });
  }
  assert.deepEqual(await db.collection('joinRequests').find({}).toArray(), beforeRequests);
  assert.deepEqual(await db.collection('users').find({}).toArray(), beforeUsers);
});
test('Stored DOB enforces below/exactly 16 and 18; underage pending/member states survive and cancellation becomes ineligible', async () => {
  const today = new Date();
  const dobForAge = age => `${today.getFullYear() - age}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const [name, minimum] of [['Exam Revision', 16], ['Suppliers', 18]]) {
    const group = await db.collection('groups').findOne({ name });
    await db.collection('users').updateOne({ id: child.id }, { $set: { dob: dobForAge(minimum - 1) } });
    const denied = await request(`/api/groups/${group.id}/join-requests`, { age: 99, dob: '1900-01-01' }, 'POST', childToken);
    assert.equal(denied.status, 403);
    assert.match(denied.body.message, new RegExp(String(minimum)));
    let browse = (await request('/api/groups/available', undefined, 'GET', childToken)).body;
    assert.equal(browse.find(item => item.id === group.id).joinState, 'ineligible');
    assert.equal(browse.find(item => item.id === group.id).minimumAge, minimum);
    await db.collection('users').updateOne({ id: child.id }, { $set: { dob: dobForAge(minimum) } });
    assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken)).status, 201);
    await db.collection('users').updateOne({ id: child.id }, { $set: { dob: dobForAge(minimum - 1) } });
    browse = (await request('/api/groups/available', undefined, 'GET', childToken)).body;
    assert.equal(browse.find(item => item.id === group.id).joinState, 'pending');
    const cancelled = await request(`/api/groups/${group.id}/join-requests`, {}, 'DELETE', childToken);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.joinState, 'ineligible');
    assert.match(cancelled.body.eligibilityMessage, new RegExp(String(minimum)));
    assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken)).status, 403);
    await db.collection('groups').updateOne({ id: group.id }, { $addToSet: { members: child.username } });
    browse = (await request('/api/groups/available', undefined, 'GET', childToken)).body;
    assert.equal(browse.find(item => item.id === group.id).joinState, 'member');
    assert.equal(Object.hasOwn(await db.collection('users').findOne({ id: child.id }), 'age'), false);
  }
});

let creationId, creationAdminToken;
const proposal = { name: 'group1', description: 'Lecturer demonstration', minimumAge: 15, colour: '#728fce' };
test('Group creation: authenticated request is pending, session-owned and creates no group', async () => {
  creationAdminToken = (await request('/api/login', { username: 'admin', password: 'admin-password' })).body.token;
  assert.equal((await request('/api/group-creation-requests', proposal)).status, 401);
  const before = await db.collection('groups').countDocuments();
  const result = await request('/api/group-creation-requests', { ...proposal, userId: child.id, username: 'spoof', role: 'superAdmin', adminIds: [child.id], status: 'approved', password: 'secret' }, 'POST', adultToken);
  assert.equal(result.status, 201);
  safe(result.body);
  creationId = result.body.request.id;
  assert.equal(result.body.request.status, 'pending');
  assert.equal(result.body.request.userId, adult.id);
  assert.equal(await db.collection('groups').countDocuments(), before);
  const mine = await request('/api/my/group-creation-requests', undefined, 'GET', adultToken);
  assert.equal(mine.body[0].id, creationId);
  assert.deepEqual((await request('/api/my/group-creation-requests', undefined, 'GET', childToken)).body, []);
  safe(mine.body);
});
test('Group creation: validates input and prevents concurrent normalized pending duplicates', async () => {
  for (const changes of [{ name: '' }, { description: {} }, { minimumAge: -1 }, { minimumAge: 1.5 }, { minimumAge: '15' }, { colour: 'url(evil)' }]) {
    assert.equal((await request('/api/group-creation-requests', { ...proposal, ...changes }, 'POST', adultToken)).status, 400);
  }
  assert.equal((await request('/api/group-creation-requests', { ...proposal, name: ' GROUP1 ' }, 'POST', adultToken)).status, 409);
  const results = await Promise.all([1, 2].map(() => request('/api/group-creation-requests', { ...proposal, name: 'Concurrent' }, 'POST', adultToken)));
  assert.deepEqual(results.map(x => x.status).sort(), [201, 409]);
});
test('Group creation: review endpoints require current authenticated Super Admin', async () => {
  for (const [suffix, method] of [['', 'GET'], [`/${creationId}/approve`, 'POST'], [`/${creationId}/reject`, 'POST']]) {
    const path = `/api/admin/group-creation-requests${suffix}`;
    assert.equal((await request(path, undefined, method)).status, 401);
    assert.equal((await request(path, method === 'POST' ? { role: 'superAdmin' } : undefined, method, adultToken)).status, 403);
  }
  assert.equal((await request('/api/groups', proposal, 'POST', adultToken)).status, 403);
  const list = await request('/api/admin/group-creation-requests', undefined, 'GET', creationAdminToken);
  assert.equal(list.status, 200);
  const item = list.body.find(x => x.id === creationId);
  assert.equal(item.username, adult.username);
  for (const key of Object.keys(proposal)) assert.equal(item[key], proposal[key]);
  safe(list.body);
});
test('Group creation: concurrent approval creates exactly one correct group, scoped admin and My Groups membership', async () => {
  const beforeUser = await db.collection('users').findOne({ id: adult.id });
  const results = await Promise.all([1, 2].map(() => request(`/api/admin/group-creation-requests/${creationId}/approve`, { userId: child.id }, 'POST', creationAdminToken)));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  results.forEach(x => safe(x.body));
  const group = await db.collection('groups').findOne({ name: 'group1' });
  assert.equal(await db.collection('groups').countDocuments({ name: 'group1' }), 1);
  for (const key of Object.keys(proposal)) assert.equal(group[key], proposal[key]);
  assert.deepEqual(group.memberIds, [adult.id]);
  assert.deepEqual(group.adminIds, [adult.id]);
  assert.deepEqual(await db.collection('users').findOne({ id: adult.id }), beforeUser);
  const mine = await request('/api/my/groups', undefined, 'GET', adultToken);
  assert.ok(mine.body.some(x => x.id === group.id && x.isGroupAdmin));
  safe(mine.body);
  assert.equal((await request(`/api/admin/group-creation-requests/${creationId}/approve`, {}, 'POST', creationAdminToken)).status, 409);
  assert.equal((await request(`/api/admin/group-creation-requests/${creationId}/reject`, {}, 'POST', creationAdminToken)).status, 409);
});
test('Group creation: rejection persists, creates no group and cannot later be approved', async () => {
  const sent = await request('/api/group-creation-requests', { ...proposal, name: 'Reject me' }, 'POST', adultToken);
  const id = sent.body.request.id;
  const before = await db.collection('groups').countDocuments();
  const result = await request(`/api/admin/group-creation-requests/${id}/reject`, {}, 'POST', creationAdminToken);
  assert.equal(result.status, 200);
  assert.equal(result.body.request.status, 'rejected');
  assert.equal(await db.collection('groups').countDocuments(), before);
  assert.equal((await request(`/api/admin/group-creation-requests/${id}/approve`, {}, 'POST', creationAdminToken)).status, 409);
  const mine = await request('/api/my/group-creation-requests', undefined, 'GET', adultToken);
  assert.equal(mine.body.find(x => x.id === id).status, 'rejected');
  safe(result.body); safe(mine.body);
});
test('Group creation: interrupted approval can be retried without duplicate groups', async () => {
  const sent = await request('/api/group-creation-requests', { ...proposal, name: 'Resume me' }, 'POST', adultToken);
  const id = sent.body.request.id;
  const { ObjectId } = await import('mongodb');
  await db.collection('groupCreationRequests').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'approving' } });
  const groups = db.collection('groups');
  const { insertWithNextId } = await import('../index.js');
  const group = await insertWithNextId(groups, { _id: `creation-request:${id}`, ...proposal, name: 'Resume me', memberIds: [adult.id], adminIds: [adult.id] });
  const result = await request(`/api/admin/group-creation-requests/${id}/approve`, {}, 'POST', creationAdminToken);
  assert.equal(result.status, 200);
  assert.equal(result.body.request.groupId, group.id);
  assert.equal(await groups.countDocuments({ name: 'Resume me' }), 1);
});

test('Group creation: same-name legacy memberships and profile renames cannot transfer membership or admin authority', async () => {
  await db.collection('users').updateOne({ id: child.id }, { $addToSet: { groups: 'group1' } });
  const other = await request('/api/my/groups', undefined, 'GET', childToken);
  assert.equal(other.body.some(group => group.name === 'group1'), false);
  const renamed = await request(`/api/users/${adult.id}`, { username: 'renamed-creator' }, 'PUT', adultToken);
  assert.equal(renamed.status, 200);
  const mine = await request('/api/my/groups', undefined, 'GET', adultToken);
  assert.ok(mine.body.some(group => group.name === 'group1' && group.isGroupAdmin));
});

test('Group creation: startup preserves submitted age even for a default group name', async () => {
  const sent = await request('/api/group-creation-requests', { ...proposal, name: 'Music' }, 'POST', adultToken);
  assert.equal(sent.status, 201);
  const approved = await request(`/api/admin/group-creation-requests/${sent.body.request.id}/approve`, {}, 'POST', creationAdminToken);
  assert.equal(approved.status, 200);
  await prepareDatabase(db);
  const group = await db.collection('groups').findOne({ id: approved.body.request.groupId });
  assert.equal(group.minimumAge, 15);
});

test('Cancel creation: authenticated owner only, pending history, no group/membership changes, resubmission allowed', async () => {
  const sent = await request('/api/group-creation-requests', { ...proposal, name: 'Cancel creation' }, 'POST', adultToken);
  const id = sent.body.request.id;
  const path = `/api/group-creation-requests/${id}`;
  const groupsBefore = await db.collection('groups').find({}).toArray();
  const usersBefore = await db.collection('users').find({}).toArray();
  for (const token of [undefined, 'a'.repeat(64)]) assert.equal((await request(path, {}, 'DELETE', token)).status, 401);
  assert.equal((await request(path, { userId: adult.id }, 'DELETE', childToken)).status, 404);
  const result = await request(path, { userId: child.id }, 'DELETE', adultToken);
  assert.equal(result.status, 200); safe(result.body);
  assert.equal(result.body.request.status, 'cancelled');
  assert.equal(result.body.request.userId, adult.id);
  // The UI hides cancelled cards; the backend must still retain their records.
  const storedCancellation = await db.collection('groupCreationRequests').findOne({ userId: adult.id, name: 'Cancel creation' });
  assert.equal(storedCancellation.status, 'cancelled');
  assert.ok(storedCancellation.resolvedAt instanceof Date);
  assert.equal((await request('/api/my/group-creation-requests', undefined, 'GET', adultToken)).body.find(x => x.id === id).status, 'cancelled');
  assert.equal((await request('/api/admin/group-creation-requests', undefined, 'GET', creationAdminToken)).body.some(x => x.id === id), false);
  assert.equal((await request(path, {}, 'DELETE', adultToken)).status, 409);
  assert.equal((await request(`/api/admin/group-creation-requests/${id}/approve`, {}, 'POST', creationAdminToken)).status, 409);
  assert.equal((await request(`/api/admin/group-creation-requests/${id}/reject`, {}, 'POST', creationAdminToken)).status, 409);
  assert.equal((await request('/api/my/group-creation-requests', undefined, 'GET', adultToken)).body.find(x => x.id === id).status, 'cancelled');
  assert.deepEqual(await db.collection('groups').find({}).toArray(), groupsBefore);
  assert.deepEqual(await db.collection('users').find({}).toArray(), usersBefore);
  assert.equal((await request('/api/group-creation-requests', { ...proposal, name: 'Cancel creation' }, 'POST', adultToken)).status, 201);
  assert.equal((await request('/api/group-creation-requests/bad', {}, 'DELETE', adultToken)).status, 400);
});
test('Cancel creation: approved, rejected, cancelled and approving records cannot be cancelled', async () => {
  for (const status of ['approved', 'rejected', 'cancelled', 'approving']) {
    const record = { userId: adult.id, name: `Protected ${status}`, normalizedName: `protected ${status}`, status };
    await db.collection('groupCreationRequests').insertOne(record);
    const result = await request(`/api/group-creation-requests/${record._id}`, {}, 'DELETE', adultToken);
    assert.equal(result.status, 409);
    assert.equal(result.body.request.status, status);
    assert.deepEqual(await db.collection('groupCreationRequests').findOne({ _id: record._id }), record);
  }
});
test('Cancel creation: racing approval has exactly one winning decision', async () => {
  const sent = await request('/api/group-creation-requests', { ...proposal, name: 'Cancel race' }, 'POST', adultToken);
  const id = sent.body.request.id;
  const [cancel, approve] = await Promise.all([
    request(`/api/group-creation-requests/${id}`, {}, 'DELETE', adultToken),
    request(`/api/admin/group-creation-requests/${id}/approve`, {}, 'POST', creationAdminToken)
  ]);
  assert.deepEqual([cancel.status, approve.status].sort(), [200, 409]);
  assert.equal(await db.collection('groups').countDocuments({ name: 'Cancel race' }), approve.status === 200 ? 1 : 0);
});

async function leaveFixture(fields = {}) {
  const { insertWithNextId } = await import('../index.js');
  return insertWithNextId(db.collection('groups'), {
    name: 'Leave test', description: 'Keep group', minimumAge: 0,
    memberIds: [adult.id, child.id], adminIds: [adult.id], members: [], chatRooms: [], ...fields
  });
}
test('Leave: session ownership, nonmember denial, removes only normal member and preserves role', async () => {
  const group = await leaveFixture();
  const path = `/api/groups/${group.id}/members/me`;
  assert.equal((await request(path, {}, 'DELETE')).status, 401);
  assert.equal((await request(path, {}, 'DELETE', 'a'.repeat(64))).status, 401);
  assert.equal((await request(path, { userId: child.id }, 'DELETE', creationAdminToken)).status, 403);
  const userBefore = await db.collection('users').findOne({ id: child.id });
  const response = await request(path, { userId: adult.id, role: 'superAdmin' }, 'DELETE', childToken);
  assert.equal(response.status, 200); safe(response.body);
  const stored = await db.collection('groups').findOne({ id: group.id });
  assert.deepEqual(stored.memberIds, [adult.id]);
  assert.deepEqual(stored.adminIds, [adult.id]);
  assert.equal(stored.description, group.description);
  assert.deepEqual(await db.collection('users').findOne({ id: child.id }), userBefore);
  assert.equal((await request('/api/my/groups', undefined, 'GET', childToken)).body.some(x => x.id === group.id), false);
  assert.equal((await request('/api/groups/available', undefined, 'GET', childToken)).body.find(x => x.id === group.id).joinState, 'available');
  assert.equal((await request(path, {}, 'DELETE', childToken)).status, 403);
  assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken)).status, 201);
  assert.equal((await request('/api/groups/999999/members/me', {}, 'DELETE', childToken)).status, 404);
  assert.equal((await request('/api/groups/nope/members/me', {}, 'DELETE', childToken)).status, 400);
});
test('Leave: sole admin denied; another admin allows leaving without changing global role', async () => {
  const group = await leaveFixture();
  const before = await db.collection('groups').findOne({ id: group.id });
  const user = await db.collection('users').findOne({ id: adult.id });
  const denied = await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', adultToken);
  assert.equal(denied.status, 409);
  assert.match(denied.body.message, /Assign another Group Admin/);
  assert.deepEqual(await db.collection('groups').findOne({ id: group.id }), before);
  await db.collection('groups').updateOne({ id: group.id }, { $addToSet: { adminIds: child.id } });
  assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', adultToken)).status, 200);
  const after = await db.collection('groups').findOne({ id: group.id });
  assert.deepEqual(after.memberIds, [child.id]); assert.deepEqual(after.adminIds, [child.id]);
  assert.deepEqual(await db.collection('users').findOne({ id: adult.id }), user);
});
test('Leave: concurrent Group Admin departures cannot remove the last admin', async () => {
  const group = await leaveFixture({ adminIds: [adult.id, child.id] });
  const outcomes = await Promise.all([adultToken, childToken].map(token => request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', token)));
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409]);
  const after = await db.collection('groups').findOne({ id: group.id });
  assert.equal(after.adminIds.length, 1); assert.deepEqual(after.memberIds, after.adminIds);
});
test('Leave: age restrictions still apply after leaving', async () => {
  const group = await leaveFixture({ minimumAge: 120 });
  assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', childToken)).status, 200);
  const available = await request('/api/groups/available', undefined, 'GET', childToken);
  assert.equal(available.body.find(x => x.id === group.id).joinState, 'ineligible');
  assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken)).status, 403);
});
test('Leave: legacy name/user-group memberships stay left without affecting namesakes or legacy admin', async () => {
  const current = await db.collection('users').findOne({ id: child.id });
  const group = await leaveFixture({ name: 'Legacy leave', admin: 'renamed-creator', members: [current.username, 'renamed-creator'] });
  await db.collection('groups').updateOne({ id: group.id }, { $unset: { adminIds: '', memberIds: '' } });
  await db.collection('users').updateOne({ id: child.id }, { $addToSet: { groups: group.name } });
  assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', adultToken)).status, 409);
  assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', childToken)).status, 200);
  const stored = await db.collection('groups').findOne({ id: group.id });
  const { isMember } = await import('../group-requests.js');
  assert.equal(isMember(stored, { ...current, groups: [group.name] }), false);
  assert.equal(isMember(stored, { id: -99, username: current.username }), true);
  assert.equal((await request('/api/my/groups', undefined, 'GET', childToken)).body.some(x => x.id === group.id), false);
  assert.equal((await request('/api/groups/available', undefined, 'GET', childToken)).body.find(x => x.id === group.id).joinState, 'available');
});

test('Leave route regression: exact browser DELETE is registered and returns JSON authentication errors, not Cannot DELETE HTML', async () => {
  const response = await fetch(`${base}/api/groups/1/members/me`, { method: 'DELETE' });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match((await response.json()).message, /log in/i);
});

test('Leave manual-data regression: username-only Study/Music records protect Cherry and let normal members leave', async () => {
  const isolated = client.db('leave_manual_data_regression');
  await isolated.collection('users').insertMany([
    { id: 1, username: 'Cherry', role: 'user', groups: ['Study', 'Music'] },
    { id: 2, username: 'James', role: 'user', groups: ['Study', 'Music'], dob: '1990-01-01' },
    { id: 3, username: 'Sarah', role: 'user', groups: ['Study', 'Music'] }
  ]);
  await isolated.collection('groups').insertMany(['Study', 'Music'].map((name, i) => ({
    id: i + 1, name, admin: 'Cherry', members: ['Cherry', 'James', 'Sarah'], minimumAge: 16,
    chatRooms: ['General']
  })));
  const cherryToken = await createSession(isolated, 1);
  const jamesToken = await createSession(isolated, 2);
  const appServer = createApp(isolated).listen(0, '127.0.0.1');
  await once(appServer, 'listening');
  const url = `http://127.0.0.1:${appServer.address().port}`;
  const get = async (path, token) => (await fetch(url + path, { headers: { Authorization: `Bearer ${token}` } })).json();
  const beforeUsers = await isolated.collection('users').find({}).toArray();
  try {
    for (const id of [1, 2]) {
      const path = `/api/groups/${id}/members/me`;
      const denied = await fetch(url + path, { method: 'DELETE', headers: { Authorization: `Bearer ${cherryToken}` } });
      assert.equal(denied.status, 409);
      assert.match((await denied.json()).message, /Assign another Group Admin/);
      const left = await fetch(url + path, { method: 'DELETE', headers: { Authorization: `Bearer ${jamesToken}` } });
      assert.equal(left.status, 200); safe(await left.json());
      assert.equal((await get('/api/my/groups', jamesToken)).some(group => group.id === id), false);
      assert.equal((await get('/api/groups/available', jamesToken)).find(group => group.id === id).joinState, 'available');
      const stored = await isolated.collection('groups').findOne({ id });
      assert.equal(stored.admin, 'Cherry');
      assert.deepEqual(stored.members, ['Cherry', 'James', 'Sarah']);
      assert.deepEqual(stored.leftMemberIds, [2]);
      assert.deepEqual(stored.chatRooms, ['General']);
    }
    assert.equal((await get('/api/my/groups', cherryToken)).length, 2);
    assert.deepEqual(await isolated.collection('users').find({}).toArray(), beforeUsers);
  } finally { await new Promise(resolve => appServer.close(resolve)); }
});

test('Member management: authenticated members see only safe current members; outsiders cannot list/promote', async () => {
  const group = await leaveFixture();
  const path = `/api/groups/${group.id}/members`;
  for (const token of [undefined, 'a'.repeat(64)]) {
    assert.equal((await request(path, undefined, 'GET', token)).status, 401);
    assert.equal((await request(`/api/groups/${group.id}/admins/${child.id}`, {}, 'POST', token)).status, 401);
  }
  assert.equal((await request(path, undefined, 'GET', creationAdminToken)).status, 403);
  const regular = await request(path, undefined, 'GET', childToken);
  assert.equal(regular.status, 200); assert.equal(regular.body.canManage, false); safe(regular.body);
  assert.deepEqual(regular.body.members.map(x => [x.id, x.isGroupAdmin]), [[adult.id, true], [child.id, false]].sort((a,b) => a[0]-b[0]));
  for (const member of regular.body.members) assert.deepEqual(Object.keys(member).sort(), ['id', 'isGroupAdmin', 'username']);
  for (const token of [childToken, creationAdminToken]) {
    assert.equal((await request(`/api/groups/${group.id}/admins/${child.id}`, { role: 'superAdmin', userId: adult.id, isGroupAdmin: true }, 'POST', token)).status, 403);
  }
  assert.equal((await request(`/api/groups/${group.id}/admins/999999`, {}, 'POST', adultToken)).status, 409);
  const outsider = await db.collection('users').findOne({ username: 'admin' });
  assert.equal((await request(`/api/groups/${group.id}/admins/${outsider.id}`, {}, 'POST', adultToken)).status, 409);
  assert.equal((await request('/api/groups/nope/members', undefined, 'GET', adultToken)).status, 400);
  assert.equal((await request(`/api/groups/${group.id}/admins/nope`, {}, 'POST', adultToken)).status, 400);
  assert.equal((await request('/api/groups/999999/members', undefined, 'GET', adultToken)).status, 404);
  assert.equal((await request(`/api/groups/999999/admins/${child.id}`, {}, 'POST', adultToken)).status, 404);
});

for (const name of ['Study', 'Music', 'Car']) {
  test(`Member management: ${name} promotion preserves members, enables original admin leave, and never changes global roles`, async () => {
    const legacy = name !== 'Car';
    const owner = await db.collection('users').findOne({ id: adult.id });
    const target = await db.collection('users').findOne({ id: child.id });
    const group = await leaveFixture({ name, chatRooms: ['General', 'Keep this room'] });
    if (legacy) await db.collection('groups').updateOne({ id: group.id }, {
      $unset: { adminIds: '', memberIds: '' }, $set: { admin: owner.username, members: [owner.username, target.username] }
    });
    const usersBefore = await db.collection('users').find({}).toArray();
    const othersBefore = await db.collection('groups').find({ id: { $ne: group.id } }).toArray();
    const list = await request(`/api/groups/${group.id}/members`, undefined, 'GET', adultToken);
    assert.equal(list.body.canManage, true);
    assert.equal(list.body.members.find(x => x.id === adult.id).isGroupAdmin, true);
    assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', adultToken)).status, 409);
    const responses = await Promise.all([1, 2].map(() => request(`/api/groups/${group.id}/admins/${child.id}`, { role: 'superAdmin' }, 'POST', adultToken)));
    for (const response of responses) { assert.equal(response.status, 200); safe(response.body); assert.equal(response.body.member.isGroupAdmin, true); }
    const promoted = await db.collection('groups').findOne({ id: group.id });
    assert.equal(promoted.adminIds.filter(id => id === child.id).length, 1);
    assert.ok(promoted.adminIds.includes(adult.id));
    assert.ok(promoted.memberIds.includes(adult.id)); assert.ok(promoted.memberIds.includes(child.id));
    assert.equal((await request(`/api/groups/${group.id}/members`, undefined, 'GET', childToken)).body.canManage, true);
    assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', adultToken)).status, 200);
    const left = await db.collection('groups').findOne({ id: group.id });
    assert.deepEqual(left.adminIds, [child.id]); assert.ok(!left.memberIds.includes(adult.id));
    assert.ok(left.memberIds.includes(child.id)); assert.deepEqual(left.chatRooms, ['General', 'Keep this room']);
    assert.equal((await request('/api/my/groups', undefined, 'GET', adultToken)).body.some(x => x.id === group.id), false);
    assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', childToken)).status, 409);
    assert.equal((await request(`/api/groups/${group.id}/admins/${adult.id}`, {}, 'POST', adultToken)).status, 403);
    assert.deepEqual(await db.collection('users').find({}).toArray(), usersBefore);
    assert.deepEqual(await db.collection('groups').find({ id: { $ne: group.id } }).toArray(), othersBefore);
  });
}

test('Member management: legacy conversion retains user.groups members and excludes prior departures', async () => {
  const owner = await db.collection('users').findOne({ id: adult.id });
  const target = await db.collection('users').findOne({ id: child.id });
  const group = await leaveFixture({ name: 'Legacy management' });
  await db.collection('groups').updateOne({ id: group.id }, { $unset: { adminIds: '', memberIds: '' }, $set: { admin: owner.username, members: [owner.username] } });
  await db.collection('users').updateOne({ id: child.id }, { $addToSet: { groups: group.name } });
  // The requester need not be in the legacy group's members array if user.groups carries membership.
  assert.equal((await request(`/api/groups/${group.id}/admins/${child.id}`, {}, 'POST', adultToken)).status, 200);
  assert.ok((await db.collection('groups').findOne({ id: group.id })).memberIds.includes(target.id));
  const departed = await leaveFixture({ name: 'Departed legacy member' });
  await db.collection('groups').updateOne({ id: departed.id }, { $unset: { adminIds: '', memberIds: '' }, $set: { admin: owner.username, members: [owner.username, target.username], leftMemberIds: [child.id] } });
  const list = await request(`/api/groups/${departed.id}/members`, undefined, 'GET', adultToken);
  assert.equal(list.body.members.some(x => x.id === child.id), false);
  assert.equal((await request(`/api/groups/${departed.id}/admins/${child.id}`, {}, 'POST', adultToken)).status, 409);
});

test('Member management: concurrent promotion/departure cannot leave a nonmember admin', async () => {
  for (const legacy of [false, true]) {
    const group = await leaveFixture();
    if (legacy) {
      const owner = await db.collection('users').findOne({ id: adult.id });
      const target = await db.collection('users').findOne({ id: child.id });
      await db.collection('groups').updateOne({ id: group.id }, { $unset: { adminIds: '', memberIds: '' }, $set: { admin: owner.username, members: [owner.username, target.username] } });
    }
    const [promotion, leave] = await Promise.all([
      request(`/api/groups/${group.id}/admins/${child.id}`, {}, 'POST', adultToken),
      request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', childToken)
    ]);
    assert.ok([200, 409].includes(promotion.status)); assert.equal(leave.status, 200);
    const current = await db.collection('groups').findOne({ id: group.id });
    assert.equal(current.adminIds?.includes(child.id) ?? false, false);
    assert.equal(current.memberIds?.includes(child.id) ?? false, false);
  }
});

async function pendingReviewFixture(name = 'Car review', legacy = false) {
  const group = await leaveFixture({ name, memberIds: [adult.id], adminIds: [adult.id] });
  if (legacy) {
    const owner = await db.collection('users').findOne({ id: adult.id });
    await db.collection('groups').updateOne({ id: group.id }, { $unset: { adminIds: '', memberIds: '' }, $set: { admin: owner.username, members: [owner.username] } });
  }
  const sent = await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken);
  assert.equal(sent.status, 201);
  const pending = await db.collection('joinRequests').findOne({ groupId: group.id, userId: child.id, status: 'pending' });
  return { group, pending, url: `/api/groups/${group.id}/join-requests/${pending._id}` };
}
test('Join review: only the specific Group Admin can list/process; identity and group scope cannot be forged', async () => {
  const { group, url } = await pendingReviewFixture();
  const other = await leaveFixture({ adminIds: [child.id], memberIds: [child.id] });
  for (const [path, method] of [[`/api/groups/${group.id}/join-requests`, 'GET'], [url + '/approve', 'POST'], [url + '/reject', 'POST']]) {
    assert.equal((await request(path, undefined, method)).status, 401);
    for (const token of [childToken, creationAdminToken]) {
      assert.equal((await request(path, method === 'POST' ? { userId: adult.id, role: 'superAdmin' } : undefined, method, token)).status, 403);
    }
  }
  await db.collection('groups').updateOne({ id: group.id }, { $addToSet: { memberIds: child.id } });
  assert.equal((await request(url + '/approve', {}, 'POST', childToken)).status, 403);
  const wrongGroup = url.replace(`/groups/${group.id}/`, `/groups/${other.id}/`);
  assert.equal((await request(wrongGroup + '/approve', {}, 'POST', childToken)).status, 404);
  const listed = await request(`/api/groups/${group.id}/join-requests`, undefined, 'GET', adultToken);
  assert.equal(listed.status, 200); assert.equal(listed.body.length, 1); safe(listed.body);
  assert.equal(listed.body[0].userId, child.id);
  assert.equal(typeof listed.body[0].username, 'string');
  assert.equal(typeof listed.body[0].age, 'number');
  assert.equal(Object.hasOwn(listed.body[0], 'dob'), false);
});
for (const name of ['Study', 'Music', 'Car']) {
  test(`Join review: ${name} approval adds a regular member who can then be promoted, without global role changes`, async () => {
    const { group, pending, url } = await pendingReviewFixture(name, name !== 'Car');
    const before = await db.collection('users').findOne({ id: child.id });
    const results = await Promise.all([1, 2].map(() => request(url + '/approve', { userId: adult.id, role: 'superAdmin' }, 'POST', adultToken)));
    assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
    const stored = await db.collection('groups').findOne({ id: group.id });
    assert.equal(stored.memberIds.filter(id => id === child.id).length, 1);
    assert.equal(stored.adminIds?.includes(child.id) ?? false, false);
    assert.equal((await db.collection('joinRequests').findOne({ _id: pending._id })).status, 'approved');
    assert.deepEqual(await db.collection('users').findOne({ id: child.id }), before);
    const members = await request(`/api/groups/${group.id}/members`, undefined, 'GET', adultToken);
    assert.equal(members.body.members.find(x => x.id === child.id).isGroupAdmin, false); safe(members.body);
    assert.equal((await request('/api/my/groups', undefined, 'GET', childToken)).body.some(x => x.id === group.id), true);
    assert.equal((await request(`/api/groups/${group.id}/join-requests`, undefined, 'GET', adultToken)).body.length, 0);
    assert.equal((await request(url + '/reject', {}, 'POST', adultToken)).status, 409);
    assert.equal((await request(`/api/groups/${group.id}/admins/${child.id}`, {}, 'POST', adultToken)).status, 200);
  });
}
test('Join review: rejection changes only request status and can be requested again', async () => {
  const { group, pending, url } = await pendingReviewFixture();
  const before = await db.collection('groups').findOne({ id: group.id });
  assert.equal((await request(url + '/reject', {}, 'POST', adultToken)).status, 200);
  assert.equal((await db.collection('joinRequests').findOne({ _id: pending._id })).status, 'rejected');
  assert.deepEqual(await db.collection('groups').findOne({ id: group.id }), before);
  assert.equal((await request(url + '/approve', {}, 'POST', adultToken)).status, 409);
  assert.equal((await request(`/api/groups/${group.id}/join-requests`, {}, 'POST', childToken)).status, 201);
});
test('Join review: changed DOB/minimum age is rechecked; invalid DOB has no age and cannot bypass eligibility', async () => {
  const { group, url } = await pendingReviewFixture();
  await db.collection('groups').updateOne({ id: group.id }, { $set: { minimumAge: 120 } });
  assert.equal((await request(url + '/approve', { age: 200, dob: '1800-01-01' }, 'POST', adultToken)).status, 409);
  const user = await db.collection('users').findOne({ id: child.id });
  await db.collection('users').updateOne({ id: child.id }, { $set: { dob: '' } });
  try {
    const listed = await request(`/api/groups/${group.id}/join-requests`, undefined, 'GET', adultToken);
    assert.equal(listed.body[0].age, null);
    assert.equal((await request(url + '/approve', {}, 'POST', adultToken)).status, 409);
  } finally { await db.collection('users').updateOne({ id: child.id }, { $set: { dob: user.dob } }); }
});
test('Join review: concurrent approve/reject and cancel/approve have one effective outcome', async () => {
  for (const cancel of [false, true]) {
    const { group, url } = await pendingReviewFixture();
    const [approve, other] = await Promise.all([
      request(url + '/approve', {}, 'POST', adultToken),
      cancel ? request(`/api/groups/${group.id}/join-requests`, {}, 'DELETE', childToken) : request(url + '/reject', {}, 'POST', adultToken)
    ]);
    assert.equal([approve, other].filter(x => x.status === 200).length, 1);
    const stored = await db.collection('groups').findOne({ id: group.id });
    assert.equal(stored.memberIds.includes(child.id), approve.status === 200);
  }
});
test('Join review: interrupted approval retries cannot re-add a member who left after membership write', async () => {
  const { group, pending, url } = await pendingReviewFixture();
  await db.collection('joinRequests').updateOne({ _id: pending._id }, { $set: { status: 'approving' } });
  await db.collection('groups').updateOne({ id: group.id }, { $addToSet: { memberIds: child.id, approvedJoinRequestIds: pending._id.toString() } });
  assert.equal((await request(`/api/groups/${group.id}/members/me`, {}, 'DELETE', childToken)).status, 200);
  assert.equal((await request(url + '/approve', {}, 'POST', adultToken)).status, 200);
  assert.equal((await db.collection('groups').findOne({ id: group.id })).memberIds.includes(child.id), false);
});
