import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/cloud.js';
import { seal, unseal } from '../src/worker.js';
const { merge, stamp } = globalThis.Cloud;
const base = () => ({ positions: [], employees: [], holidays: [], kasbon: [], bonuses: [], attendance: [], _tomb: {}, profile: { name: 'A' } });

test('merge: item terbaru menang, union dua perangkat', () => {
  const a = base(), b = base();
  a.employees = [{ id: '1', name: 'Lama', _u: 1 }, { id: '2', name: 'HP-A', _u: 5 }];
  b.employees = [{ id: '1', name: 'Baru', _u: 9 }, { id: '3', name: 'HP-B', _u: 2 }];
  const m = merge(a, b);
  assert.deepEqual(m.employees.map((e) => e.name).sort(), ['Baru', 'HP-A', 'HP-B']);
});
test('merge: tombstone yang lebih baru menghapus item', () => {
  const a = base(), b = base();
  a.kasbon = [{ id: 'k', amount: 1, _u: 3 }];
  b._tomb = { kasbon: [{ id: 'k', _u: 8 }] };
  const m = merge(a, b);
  assert.equal(m.kasbon.length, 0);
  assert.equal(m._tomb.kasbon.length, 1);
});
test('stamp: deteksi ubah & hapus', () => {
  const db = base(); db.employees = [{ id: '1', name: 'X' }, { id: '2', name: 'Y' }];
  let snap = stamp(db, {}, 100); assert.equal(db.employees[0]._u, 100);
  db.employees[0].name = 'X2'; db.employees = db.employees.filter((e) => e.id !== '2');
  snap = stamp(db, snap, 200);
  assert.equal(db.employees[0]._u, 200);
  assert.deepEqual(db._tomb.employees, [{ id: '2', _u: 200 }]);
});
test('session cookie: round-trip & tamper ditolak', async () => {
  const env = { SESSION_SECRET: 'x'.repeat(32) };
  const t = await seal(env, { rt: 'r', email: 'a@b.c' });
  assert.equal((await unseal(env, t)).email, 'a@b.c');
  assert.equal(await unseal(env, t.slice(0, -2) + 'AA'), null);
  assert.equal(await unseal({ SESSION_SECRET: 'y'.repeat(32) }, t), null);
});
