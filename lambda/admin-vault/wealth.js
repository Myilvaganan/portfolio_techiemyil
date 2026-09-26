// Net-worth history and savings goals.
//
//   GET  /admin/wealth/snapshots        one snapshot per month, oldest first
//   POST /admin/wealth/snapshots        { month, assets:{portfolio,bank,other}, liabilities:{loans,cards}, net }  (upsert)
//   GET  /admin/wealth/goals
//   POST /admin/wealth/goals            { id?, name, targetAmount, targetDate, startAmount?, monthlyContribution?, kind }
//   DELETE /admin/wealth/goals?id=
//
// Stored in _data/wealth/snapshots.json and _data/wealth/goals.json with conditional (ETag) writes.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const SNAPSHOTS_KEY = '_data/wealth/snapshots.json'
const GOALS_KEY = '_data/wealth/goals.json'
const MAX_SNAPSHOTS = 240
const MAX_GOALS = 50
const KINDS = ['house', 'bike', 'emergency', 'other']
const MAX_AMOUNT = 1e12

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_AMOUNT ? Math.round(v * 100) / 100 : null)
const validMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
const validDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))

function sanitizeSnapshot(p, nowIso) {
  if (!p || typeof p !== 'object') return { error: 'Invalid snapshot.' }
  if (!validMonth(p.month)) return { error: 'Invalid month.' }
  const a = p.assets || {}
  const l = p.liabilities || {}
  const assets = { portfolio: num(a.portfolio), bank: num(a.bank), other: a.other === undefined ? 0 : num(a.other) }
  const liabilities = { loans: num(l.loans), cards: num(l.cards) }
  if (Object.values(assets).some((v) => v === null) || Object.values(liabilities).some((v) => v === null)) return { error: 'Invalid amounts.' }
  const net = Math.round((assets.portfolio + assets.bank + assets.other - liabilities.loans - liabilities.cards) * 100) / 100
  return { value: { month: p.month, assets, liabilities, net, takenAt: nowIso } }
}

function upsertSnapshot(list, snap) {
  const rest = (Array.isArray(list) ? list : []).filter((s) => s.month !== snap.month)
  return [...rest, snap].sort((a, b) => a.month.localeCompare(b.month)).slice(-MAX_SNAPSHOTS)
}

function sanitizeGoal(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid goal.' }
  const name = text(p.name, 80)
  if (!name) return { error: 'Please name the goal.' }
  const targetAmount = num(p.targetAmount)
  if (targetAmount === null || targetAmount <= 0) return { error: 'Target amount must be positive.' }
  if (!validDate(p.targetDate)) return { error: 'Invalid target date.' }
  const kind = KINDS.includes(p.kind) ? p.kind : 'other'
  const value = { id: text(p.id, 64) || '', name, targetAmount, targetDate: p.targetDate, kind }
  for (const k of ['startAmount', 'monthlyContribution']) {
    if (p[k] === undefined || p[k] === null || p[k] === '') continue
    const v = num(p[k])
    if (v === null || v < 0) return { error: `Invalid ${k}.` }
    value[k] = v
  }
  return { value }
}

function createWealthApi({ s3, bucket }) {
  async function readJson(key) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      return { data: JSON.parse(await out.Body.transformToString()), etag: out.ETag }
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return { data: null, etag: null }
      throw err
    }
  }

  async function update(key, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, etag } = await readJson(key)
      const next = change(data)
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(next), ContentType: 'application/json', ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
        return next
      } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode
        if (status !== 412 && status !== 409 && !(err && err.name === 'PreconditionFailed')) throw err
      }
    }
    throw new Error('Too many concurrent updates.')
  }

  async function listSnapshots() {
    const { data } = await readJson(SNAPSHOTS_KEY)
    return { statusCode: 200, body: { snapshots: (data && data.snapshots) || [] } }
  }

  async function saveSnapshot(payload) {
    const parsed = sanitizeSnapshot(payload, new Date().toISOString())
    if (parsed.error) return { statusCode: 400, body: { error: parsed.error } }
    const next = await update(SNAPSHOTS_KEY, (doc) => ({ snapshots: upsertSnapshot(doc && doc.snapshots, parsed.value) }))
    return { statusCode: 200, body: { snapshots: next.snapshots } }
  }

  async function listGoals() {
    const { data } = await readJson(GOALS_KEY)
    return { statusCode: 200, body: { goals: (data && data.goals) || [] } }
  }

  async function saveGoal(payload) {
    const parsed = sanitizeGoal(payload)
    if (parsed.error) return { statusCode: 400, body: { error: parsed.error } }
    let full = false
    const next = await update(GOALS_KEY, (doc) => {
      const goals = (doc && doc.goals) || []
      const id = parsed.value.id
      if (id && goals.some((g) => g.id === id)) return { goals: goals.map((g) => (g.id === id ? parsed.value : g)) }
      if (goals.length >= MAX_GOALS) {
        full = true
        return { goals }
      }
      return { goals: [...goals, { ...parsed.value, id: crypto.randomUUID() }] }
    })
    if (full) return { statusCode: 400, body: { error: 'Too many goals.' } }
    return { statusCode: 200, body: { goals: next.goals } }
  }

  async function deleteGoal(query) {
    const id = text(query && query.id, 64)
    if (!id) return { statusCode: 400, body: { error: 'Missing id.' } }
    const next = await update(GOALS_KEY, (doc) => ({ goals: ((doc && doc.goals) || []).filter((g) => g.id !== id) }))
    return { statusCode: 200, body: { goals: next.goals } }
  }

  async function route({ method, path, payload, query }) {
    if (method === 'GET' && path === '/admin/wealth/snapshots') return listSnapshots()
    if (method === 'POST' && path === '/admin/wealth/snapshots') return saveSnapshot(payload)
    if (method === 'GET' && path === '/admin/wealth/goals') return listGoals()
    if (method === 'POST' && path === '/admin/wealth/goals') return saveGoal(payload)
    if (method === 'DELETE' && path === '/admin/wealth/goals') return deleteGoal(query)
    return null
  }

  return { route }
}

module.exports = { createWealthApi, sanitizeSnapshot, sanitizeGoal, upsertSnapshot }
