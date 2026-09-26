// Personal-finance settings: monthly budgets, category rules and per-transaction / per-merchant tags.
//
//   GET  /admin/finance/budgets   -> { budgets: { [category]: monthlyLimit } }
//   POST /admin/finance/budgets   { category, limit }  (limit 0 or null removes it)
//   GET  /admin/finance/rules     -> { rules: [{ id, match, category }] }
//   POST /admin/finance/rules     { add: { match, category } } or { remove: id }
//   GET  /admin/finance/tags      -> { tags: { [key]: 'family' | 'household' | 'ignore' } }
//   POST /admin/finance/tags      { key, tag }  (key is "id:<txnId>" or "m:<merchant>"; tag null removes it)
//
// Stored as _data/finance/{budgets,rules,tags}.json. Writes use the object's ETag and retry on a conflict.

const crypto = require('crypto')
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')

const KEYS = { budgets: '_data/finance/budgets.json', rules: '_data/finance/rules.json', tags: '_data/finance/tags.json' }
const MAX_BUDGETS = 60
const MAX_RULES = 300
const MAX_TAGS = 5000
const MAX_LIMIT = 100_000_000
const TAGS = ['family', 'household', 'ignore']

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const bad = (error) => ({ statusCode: 400, body: { error } })

function sanitizeBudget(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid request.' }
  const category = text(p.category, 40)
  if (!category) return { error: 'Choose a category.' }
  if (p.limit === null || p.limit === 0 || p.limit === undefined) return { value: { category, limit: 0 } }
  const limit = Number(p.limit)
  if (!Number.isFinite(limit) || limit < 0 || limit > MAX_LIMIT) return { error: 'Enter a valid monthly limit.' }
  return { value: { category, limit: Math.round(limit) } }
}

function sanitizeRule(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid rule.' }
  const match = text(p.match, 80)
  const category = text(p.category, 40)
  if (match.length < 2) return { error: 'The text to match is too short.' }
  if (!category) return { error: 'Choose a category.' }
  return { value: { match, category } }
}

function sanitizeTag(p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid request.' }
  const key = text(p.key, 200)
  if (!/^(id|m):.+/.test(key)) return { error: 'Invalid tag key.' }
  if (p.tag === null || p.tag === undefined) return { value: { key, tag: null } }
  if (!TAGS.includes(p.tag)) return { error: 'Tag must be family, household or ignore.' }
  return { value: { key, tag: p.tag } }
}

function createFinanceApi({ s3, bucket }) {
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

  const obj = (d) => (d && typeof d === 'object' && !Array.isArray(d) ? d : {})

  async function setBudget(payload) {
    const p = sanitizeBudget(payload)
    if (p.error) return bad(p.error)
    let full = false
    const doc = await update(KEYS.budgets, (d) => {
      const budgets = { ...obj(d).budgets }
      full = false
      if (!p.value.limit) delete budgets[p.value.category]
      else if (budgets[p.value.category] === undefined && Object.keys(budgets).length >= MAX_BUDGETS) full = true
      else budgets[p.value.category] = p.value.limit
      return { budgets }
    })
    if (full) return bad('Too many budgets.')
    return { statusCode: 200, body: { budgets: doc.budgets } }
  }

  async function setRule(payload) {
    if (!payload || typeof payload !== 'object') return bad('Invalid request.')
    let rule = null
    let error = ''
    if (payload.add) {
      const p = sanitizeRule(payload.add)
      if (p.error) return bad(p.error)
      rule = { id: crypto.randomUUID(), ...p.value }
    } else if (!text(payload.remove, 80)) return bad('Invalid request.')
    const doc = await update(KEYS.rules, (d) => {
      let rules = Array.isArray(obj(d).rules) ? obj(d).rules : []
      if (rule) {
        rules = rules.filter((r) => r.match.toLowerCase() !== rule.match.toLowerCase())
        if (rules.length >= MAX_RULES) error = 'Too many rules.'
        else rules = [...rules, rule]
      } else rules = rules.filter((r) => r.id !== payload.remove)
      return { rules }
    })
    if (error) return bad(error)
    return { statusCode: 200, body: { rules: doc.rules } }
  }

  async function setTag(payload) {
    const p = sanitizeTag(payload)
    if (p.error) return bad(p.error)
    let full = false
    const doc = await update(KEYS.tags, (d) => {
      const tags = { ...obj(d).tags }
      full = false
      if (p.value.tag === null) delete tags[p.value.key]
      else if (tags[p.value.key] === undefined && Object.keys(tags).length >= MAX_TAGS) full = true
      else tags[p.value.key] = p.value.tag
      return { tags }
    })
    if (full) return bad('Too many tags.')
    return { statusCode: 200, body: { tags: doc.tags } }
  }

  async function read(name, field, fallback) {
    const { data } = await readJson(KEYS[name])
    return { statusCode: 200, body: { [field]: obj(data)[field] ?? fallback } }
  }

  async function route({ method, path, payload }) {
    if (method === 'GET' && path === '/admin/finance/budgets') return read('budgets', 'budgets', {})
    if (method === 'POST' && path === '/admin/finance/budgets') return setBudget(payload)
    if (method === 'GET' && path === '/admin/finance/rules') return read('rules', 'rules', [])
    if (method === 'POST' && path === '/admin/finance/rules') return setRule(payload)
    if (method === 'GET' && path === '/admin/finance/tags') return read('tags', 'tags', {})
    if (method === 'POST' && path === '/admin/finance/tags') return setTag(payload)
    return null
  }

  return { route }
}

module.exports = { createFinanceApi, sanitizeBudget, sanitizeRule, sanitizeTag }
