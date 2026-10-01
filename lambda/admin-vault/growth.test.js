import { test } from 'vitest'
import assert from 'node:assert'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { SANITIZERS, createGrowthApi } = require('./growth')

test('guardrails keep only valid numbers and short checklist items', () => {
  const v = SANITIZERS.guardrails({ maxLossPerTrade: 10000, weeklyLossLimit: -5, maxQtyPerTrade: 'x', cooldownDays: 2, checklist: ['Stop set?', '', 5] })
  assert.deepStrictEqual(v, { maxLossPerTrade: 10000, weeklyLossLimit: 0, maxQtyPerTrade: 0, cooldownDays: 2, checklist: ['Stop set?'] })
})

test('habit checks drop unknown habits and bad dates', () => {
  const v = SANITIZERS.habits({ habits: [{ id: 'walk1', name: 'Walk', auto: 'steps', target: 10000 }], checks: { '2026-09-28': ['walk1', 'nope'], bad: ['walk1'] } })
  assert.deepStrictEqual(v.checks, { '2026-09-28': ['walk1'] })
})

test('life admin items need a title and a real date', () => {
  const v = SANITIZERS['life-admin']({ items: [{ title: 'Passport', dueDate: '2027-01-10', category: 'identity' }, { title: 'x', dueDate: 'soon' }] })
  assert.strictEqual(v.items.length, 1)
  assert.strictEqual(v.items[0].category, 'identity')
})

test('the handler rejects unknown documents and stores sanitized values', async () => {
  const saved = {}
  const s3 = { send: async (cmd) => { if (cmd.input.Body) { saved[cmd.input.Key] = cmd.input.Body; return {} } const e = new Error('x'); e.name = 'NoSuchKey'; throw e } }
  const api = createGrowthApi({ s3, bucket: 'b' })
  assert.strictEqual((await api({ method: 'GET', path: '/admin/growth', query: { doc: 'secrets' } })).statusCode, 400)
  const r = await api({ method: 'POST', path: '/admin/growth', payload: { doc: 'debt', value: { extraPerMonth: 5000, strategy: 'snowball', evil: 1 } } })
  assert.deepStrictEqual(r.body.value, { extraPerMonth: 5000, strategy: 'snowball' })
  assert.ok(saved['_data/growth/debt.json'])
  const g = await api({ method: 'GET', path: '/admin/growth', query: { doc: 'habits' } })
  assert.deepStrictEqual(g.body.value, { habits: [], checks: {} })
})

it('profile keeps text fields and only a small image data URL', async () => {
  const v = SANITIZERS.profile({ displayName: '  Myil ', dob: '1990-02-30x', photo: 'javascript:alert(1)', email: 'a@b.c' })
  expect(v).toMatchObject({ displayName: 'Myil', dob: '', photo: '', email: 'a@b.c' })
  expect(SANITIZERS.profile({ photo: 'data:image/jpeg;base64,AAAA' }).photo).toBe('data:image/jpeg;base64,AAAA')
})
