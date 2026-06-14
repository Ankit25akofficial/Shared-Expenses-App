import { test } from 'node:test';
import assert from 'node:assert';
import prisma from '../src/lib/prisma';

test('Database Client Integration Tests', async (t) => {
  await t.test('Verify Prisma client initialization and type definitions', () => {
    assert.ok(prisma);
    assert.strictEqual(typeof prisma.group.findMany, 'function');
    assert.strictEqual(typeof prisma.user.findMany, 'function');
    assert.strictEqual(typeof prisma.expense.findMany, 'function');
  });

  await t.test('Verify Prisma connection string format in env', () => {
    const dbUrl = process.env.DATABASE_URL || '';
    assert.ok(dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));
  });
});
