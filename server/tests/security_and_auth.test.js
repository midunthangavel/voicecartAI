import test from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, verifyToken, hashPassword, verifyPassword, authenticateUser } from '../src/services/auth.service.js';
import { initDatabase, dbRun, dbGet, transaction } from '../src/db.js';
import { unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const TEST_DB = resolve('./test_security.db');

test.before(async () => {
  if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  process.env.DB_PATH = TEST_DB;
  await initDatabase();
});

test.after(async () => {
  try { if (existsSync(TEST_DB)) unlinkSync(TEST_DB); } catch {}
});

test('Security: Individual Salt Password Hashing & Verification', async () => {
  const password = 'SuperSecretPassword@2026';
  const hashed1 = await hashPassword(password);
  const hashed2 = await hashPassword(password);

  // Individual salts ensure hashes for same password are completely different
  assert.notEqual(hashed1, hashed2);
  assert.ok(hashed1.includes(':'));

  assert.equal(await verifyPassword(password, hashed1), true);
  assert.equal(await verifyPassword(password, hashed2), true);
  assert.equal(await verifyPassword('WrongPassword', hashed1), false);
});

test('Security: Jose Cryptographic JWT Issuance & Verification', async () => {
  const user = {
    id: 'user_101',
    email: 'admin@annapoorna.com',
    name: 'Admin Manager',
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    role: 'ADMIN',
  };

  const token = await generateToken(user);
  assert.ok(typeof token === 'string');
  assert.equal(token.split('.').length, 3); // Valid compact JWT format

  const claims = await verifyToken(token);
  assert.equal(claims.sub, 'user_101');
  assert.equal(claims.email, 'admin@annapoorna.com');
  assert.equal(claims.tenant_id, 't_annapoorna');
  assert.equal(claims.restaurant_id, 'r_coimbatore_01');
  assert.equal(claims.role, 'ADMIN');
  assert.equal(claims.iss, 'voicecart-api');
  assert.equal(claims.aud, 'voicecart-dashboard');
});

test('Security: Tampered or Malformed JWT Token Rejection', async () => {
  await assert.rejects(
    async () => verifyToken('invalid.token.structure'),
    /Authentication failed/
  );

  const validToken = await generateToken({ id: '1', email: 'test@test.com', role: 'STAFF', tenant_id: 't_annapoorna', restaurant_id: 'r_coimbatore_01' });
  const tamperedToken = validToken.slice(0, -5) + 'xxxxx';

  await assert.rejects(
    async () => verifyToken(tamperedToken),
    /Authentication failed/
  );
});

test('Security: User Authentication from Database', async () => {
  const auth = await authenticateUser('admin@annapoorna.com', 'Annapoorna@123');
  assert.ok(auth.token);
  assert.equal(auth.user.email, 'admin@annapoorna.com');
  assert.equal(auth.user.role, 'ADMIN');

  await assert.rejects(
    async () => authenticateUser('admin@annapoorna.com', 'WrongPassword123'),
    /Invalid email or password/
  );

  await assert.rejects(
    async () => authenticateUser('nonexistent@restaurant.com', 'SomePassword123'),
    /Invalid email or password/
  );
});

test('Database: Atomic Transaction Rollback on Failure', async () => {
  // Check initial count
  const initial = await dbGet('SELECT COUNT(*) as count FROM orders');

  await assert.rejects(
    async () => {
      await transaction(async () => {
        await dbRun(
          `INSERT INTO orders (tenant_id, restaurant_id, status, total_amount) 
           VALUES ('t_annapoorna', 'r_coimbatore_01', 'pending', 500)`
        );

        // Force an intentional error to trigger rollback
        throw new Error('Simulated mid-transaction failure');
      });
    },
    /Simulated mid-transaction failure/
  );

  const afterRollback = await dbGet('SELECT COUNT(*) as count FROM orders');
  assert.equal(afterRollback.count, initial.count);
});
