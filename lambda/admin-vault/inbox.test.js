import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createInboxApi, senderAllowed, guessKind, kindFromLines } = require('./inbox.js')

function fakeS3() {
  const store = new Map()
  let v = 0
  return {
    store,
    send: async (cmd) => {
      const name = cmd.constructor.name
      const { Key, Body, IfMatch, IfNoneMatch } = cmd.input
      if (name === 'GetObjectCommand') {
        const o = store.get(Key)
        if (!o) throw Object.assign(new Error('x'), { name: 'NoSuchKey' })
        return { ETag: o.etag, Body: { transformToByteArray: async () => Buffer.from(o.body) } }
      }
      const o = store.get(Key)
      if ((IfMatch && (!o || o.etag !== IfMatch)) || (IfNoneMatch && o)) throw Object.assign(new Error('p'), { $metadata: { httpStatusCode: 412 } })
      store.set(Key, { body: Buffer.isBuffer(Body) ? Body : Buffer.from(String(Body)), etag: `"${++v}"` })
      return {}
    },
  }
}

const KEY = 'test-ingest-key'
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(400, 1)])
const body = (over = {}) => ({ filename: 'AcctStatement.pdf', from: 'Estatement <estatement@icici.bank.in>', subject: 'ICICI Bank Statement for XXXXXXXX6512', receivedAt: '2026-09-07T05:41:00Z', pdfBase64: pdf.toString('base64'), ...over })

const make = (extra = {}) => {
  const s3 = fakeS3()
  const statementsApi = vi.fn(async () => ({ statusCode: 200, body: { id: 'x', pages: 3, chunks: 2, fileKey: 'k' } }))
  const readPdf = vi.fn(async (bytes, pw) => {
    if (pw !== 'right') throw Object.assign(new Error('locked'), { code: pw ? 'wrong_password' : 'password_required' })
    return { lines: ['Statement of Transactions in Saving Account no. 1', 'Transaction | Withdrawal | Deposit | Balance'], pageCount: 3, decrypted: bytes }
  })
  const detectBank = (l) => (/Statement of Transactions in Saving/.test(l.join('\n')) ? 'icici' : null)
  const api = createInboxApi({ s3, bucket: 'b', ingestKey: KEY, secretKey: 'k', statementsApi, readPdf, detectBank, ...extra })
  return { api, s3, statementsApi, readPdf }
}

describe('inbox', () => {
  it('only takes statement mail from the banks, with the right key', async () => {
    expect(senderAllowed('Estatement <estatement@icici.bank.in>')).toBe(true)
    expect(senderAllowed('statements@axis.bank.in')).toBe(true)
    expect(senderAllowed('offers@evil-icici.bank.in.example.com')).toBe(false)
    expect(senderAllowed('someone@gmail.com')).toBe(false)
    const { api } = make()
    expect((await api.ingest({ 'x-ingest-key': 'nope' }, body())).statusCode).toBe(401)
    expect((await api.ingest({ 'x-ingest-key': KEY }, body({ from: 'a@gmail.com' }))).body.status).toBe('ignored')
    expect((await api.ingest({ 'x-ingest-key': KEY }, body({ pdfBase64: Buffer.from('hello').toString('base64') }))).body.status).toBe('ignored')
  })

  it('saves a statement once and treats a re-send as a duplicate', async () => {
    const { api, s3 } = make()
    const first = await api.ingest({ 'x-ingest-key': KEY }, body())
    expect(first.body.status).toBe('saved')
    expect((await api.ingest({ 'x-ingest-key': KEY }, body())).body.status).toBe('duplicate')
    const list = await api.adminRoute({ method: 'GET', path: '/admin/inbox' })
    expect(list.body.items).toHaveLength(1)
    expect(list.body.items[0]).toMatchObject({ status: 'new', guess: 'bank' })
    expect([...s3.store.keys()].filter((k) => k.endsWith('.pdf'))).toHaveLength(1)
  })

  it('tries the saved passwords, works out the kind, and hands the file to the normal pipeline', async () => {
    const { api, statementsApi, readPdf } = make()
    await api.adminRoute({ method: 'POST', path: '/admin/inbox/passwords', payload: { label: 'Axis', password: 'wrong' } })
    await api.adminRoute({ method: 'POST', path: '/admin/inbox/passwords', payload: { label: 'ICICI', password: 'right' } })
    const saved = await api.ingest({ 'x-ingest-key': KEY }, body())
    const res = await api.adminRoute({ method: 'POST', path: '/admin/inbox/prepare', payload: { id: saved.body.id } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ kind: 'bank', chunks: 2, filename: 'AcctStatement.pdf' })
    expect(readPdf.mock.calls.map((c) => c[1])).toEqual(['', 'wrong', 'right'])
    expect(statementsApi).toHaveBeenCalledWith(expect.objectContaining({ path: '/admin/statements/prepare', payload: expect.objectContaining({ kind: 'bank', password: 'right' }) }))
    const list = await api.adminRoute({ method: 'GET', path: '/admin/inbox' })
    expect(list.body.items[0].status).toBe('ready')
    expect(JSON.stringify(list.body)).not.toContain('right')
  })

  it('asks for a password when none of the saved ones open the PDF, and marks it failed', async () => {
    const { api } = make()
    const saved = await api.ingest({ 'x-ingest-key': KEY }, body())
    const res = await api.adminRoute({ method: 'POST', path: '/admin/inbox/prepare', payload: { id: saved.body.id } })
    expect(res.statusCode).toBe(422)
    expect(res.body.code).toBe('password_required')
    expect((await api.adminRoute({ method: 'GET', path: '/admin/inbox' })).body.items[0].status).toBe('failed')
  })

  it('can mark items done or dismiss them, and remove a saved password', async () => {
    const { api } = make()
    const a = await api.ingest({ 'x-ingest-key': KEY }, body())
    await api.adminRoute({ method: 'POST', path: '/admin/inbox/done', payload: { id: a.body.id, statementId: 'abc123' } })
    expect((await api.adminRoute({ method: 'GET', path: '/admin/inbox' })).body.items[0]).toMatchObject({ status: 'done', statementId: 'abc123' })
    const p = await api.adminRoute({ method: 'POST', path: '/admin/inbox/passwords', payload: { label: 'X', password: 'pw' } })
    await api.adminRoute({ method: 'DELETE', path: '/admin/inbox/passwords', query: { id: p.body.id } })
    expect((await api.adminRoute({ method: 'GET', path: '/admin/inbox' })).body.passwords).toEqual([])
  })

  it('guesses and confirms the kind of statement', () => {
    expect(guessKind('Your ICICI Bank Credit Card Statement', 'x.pdf')).toBe('card')
    expect(guessKind('Loan account statement', 'x.pdf')).toBe('loan')
    expect(guessKind('Axis Bank Statement : Money Quotient', 'x.pdf')).toBe('bank')
    expect(kindFromLines(['Customer Name | Card Account No', 'Card Number : | 4035 XXXX XXXX 5001'], () => null)).toBe('card')
    expect(kindFromLines(['Customer Name | Card Account No', 'Card Number : | 4035 XXXX XXXX 5001', '02-APR-25 | Interest Amount Amortization -'], () => null)).toBe('card')
    expect(kindFromLines(['LOAN ACCOUNT STATEMENT', 'Loan A/c No'], () => null)).toBe('loan')
    expect(kindFromLines(['hello world'], () => null)).toBeNull()
  })
})
