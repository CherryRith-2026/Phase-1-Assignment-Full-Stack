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
async function request(path, body, method = 'POST') {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' },
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
    safe((await request(`/api/users/${user.id}`, { firstName: 'Updated', role: 'superAdmin', password: 'replacement' }, 'PUT')).body);
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
