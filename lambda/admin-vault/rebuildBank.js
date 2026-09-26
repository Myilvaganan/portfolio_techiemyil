// One-off repair: re-reads every stored bank statement with the deterministic parsers (bankParse.js), rebuilds its
// transactions (correct payee, direction and channel), classifies them (bankClassify.js) and rewrites
// _data/statements/bank/data.json. The previous file is copied to data.backup-<time>.json first.
//
//   node rebuildBank.js            dry run: prints a summary, writes nothing
//   node rebuildBank.js --write    backs up and writes

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3')
const { parseBankStatement } = require('./bankParse')
const { classifyBankRow } = require('./bankClassify')

const BUCKET = process.env.S3_BUCKET || 'techiemyil-admin-vault'
const KEY = '_data/statements/bank/data.json'
const s3 = new S3Client({ region: 'ap-south-1' })
const WRITE = process.argv.includes('--write')

async function getJson(key) {
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return JSON.parse(await out.Body.transformToString())
}

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)

async function main() {
  const data = await getJson(KEY)
  const old = new Map()
  for (const t of data.transactions) old.set(`${t.statementId}|${t.date}|${t.debit || t.credit}`, t)

  const statements = [...data.statements].sort((a, b) => (a.periodFrom || '').localeCompare(b.periodFrom || ''))
  const transactions = []
  const seen = new Set()
  const report = []
  let keptOld = 0

  for (const s of statements) {
    const text = await getJson(`_data/statements/bank/${s.id}/text.json`)
    const parsed = parseBankStatement(s.bank, text.lines, s.openingBalance)
    if (!parsed) {
      report.push(`${s.id}: layout not recognised, kept the old rows`)
      transactions.push(...data.transactions.filter((t) => t.statementId === s.id))
      continue
    }
    let added = 0
    let dupes = 0
    parsed.rows.forEach((r, i) => {
      const sig = `${s.accountKey}|${r.date}|${r.debit}|${r.credit}|${r.balance}`
      if (seen.has(sig)) {
        dupes++
        return
      }
      seen.add(sig)
      const c = classifyBankRow(r)
      let { category } = c
      if (category === 'Other') {
        // Keep the earlier reading only when the earlier merchant name really appears in this row's own text.
        const prev = old.get(`${s.id}|${r.date}|${r.debit || r.credit}`)
        const own = `${r.tag || ''} ${r.description}`.toLowerCase()
        if (prev && prev.category !== 'Other' && words(prev.merchant).some((w) => own.includes(w))) {
          category = prev.category
          keptOld++
        }
      }
      transactions.push({
        date: r.date,
        description: r.description.slice(0, 200),
        merchant: c.merchant,
        debit: r.debit,
        credit: r.credit,
        category,
        balance: r.balance,
        channel: c.channel,
        id: `${s.id}-${i}`,
        statementId: s.id,
        accountKey: s.accountKey,
      })
      added++
    })
    s.txnCount = added
    s.duplicatesSkipped = dupes
    if (s.closingBalance == null && parsed.rows.length) s.closingBalance = parsed.rows[parsed.rows.length - 1].balance
    if (s.openingBalance == null && parsed.opening != null) s.openingBalance = parsed.opening
    report.push(`${s.id} ${s.bank} ${s.periodFrom}..${s.periodTo}: ${parsed.rows.length} rows, ${added} kept, ${dupes} duplicates, ${parsed.unresolvedDays} unresolved days`)
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true }))
  const next = { ...data, statements, transactions, insights: null, updatedAt: new Date().toISOString() }
  const cats = {}
  for (const t of transactions) cats[t.category] = (cats[t.category] || 0) + 1
  console.log(report.join('\n'))
  console.log(`before ${data.transactions.length} transactions, after ${transactions.length}; kept ${keptOld} earlier categories`)
  console.log(Object.entries(cats).sort((a, b) => b[1] - a[1]).map((e) => e.join(':')).join('  '))

  if (!WRITE) return console.log('\nDry run. Re-run with --write to save.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY.replace('data.json', `data.backup-${stamp}.json`), Body: JSON.stringify(data), ContentType: 'application/json' }))
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: JSON.stringify(next), ContentType: 'application/json' }))
  console.log(`Saved. Backup: ${KEY.replace('data.json', `data.backup-${stamp}.json`)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
