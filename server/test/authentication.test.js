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
