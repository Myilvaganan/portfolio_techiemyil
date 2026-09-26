// Deterministic readers for the ICICI and Axis savings-account statement layouts.
//
// Both banks print part of a transaction's description on the line *above* its date row (ICICI: a short payee tag;
// Axis: the first half of the remarks). Reading rows one at a time therefore attaches text to the wrong amount, which
// is how a self-transfer once became "Indian Oil ₹20,000". These parsers rebuild each row from the full layout and prove
// the result with the running balance: every row must equal the previous balance minus the debit plus the credit.

const num = (s) => Number(String(s).replace(/,/g, ''))

// Lines that are page furniture, never part of a transaction.
const NOISE = [
  /^=== page \d+ ===$/,
  /^\d{1,3}$/,
  /^Transaction \| Withdrawal/i,
  /^S No\. \| Cheque/i,
  /^Date \| Amount/i,
  /^Tran Date \| Chq No/i,
  /^Br$/,
  /icici\.bank\.in|Dial your Bank|registered mobile number|Never share your OTP/i,
  /^Legends|^This is a system|^Page \d+ of \d+/i,
]
const isNoise = (l) => NOISE.some((re) => re.test(l.trim()))

// Some PDFs leak font markup into the extracted text ("<style fontName='Mulish'>EBA/F&O</style>").
const stripMarkup = (lines) => lines.map((l) => l.replace(/<\/?style[^>]*>/g, '').trim()).filter(Boolean)

const isoFromDots = (d) => {
  const [dd, mm, yyyy] = d.split(/[.\-/]/)
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

// ---------- ICICI: "<tag>" / "N | dd.mm.yyyy | [cheque |] amount | balance" / remarks lines ----------

const ICICI_ROW = /^(\d{1,5}) \| (\d{2}\.\d{2}\.\d{4})(?: \| ([^|]*?))? \| ([\d,]+\.\d{2}) \| (-?[\d,]+\.\d{2})$/

function parseIcici(lines) {
  const body = stripMarkup(lines).filter((l) => !isNoise(l) && !/^trxn$/i.test(l))
  const rowIdx = []
  body.forEach((l, i) => ICICI_ROW.test(l) && rowIdx.push(i))
  const rows = []
  rowIdx.forEach((at, k) => {
    const m = body[at].match(ICICI_ROW)
    const next = k + 1 < rowIdx.length ? rowIdx[k + 1] : body.length
    // The line right before the next row is that row's tag; everything between is this row's remarks.
    const end = k + 1 < rowIdx.length ? next - 1 : next
    let remarks = body.slice(at + 1, end)
    if (k + 1 === rowIdx.length) remarks = remarks.filter((l) => !/^(Opening|Closing|Total|Account Related|Statement Summary)/i.test(l)).slice(0, 4)
    const tag = at > 0 && (k === 0 || rowIdx[k - 1] < at - 1) ? body[at - 1] : ''
    rows.push({ serial: Number(m[1]), date: isoFromDots(m[2]), cheque: (m[3] || '').trim(), amount: num(m[4]), balance: num(m[5]), tag, description: joinWrapped(remarks) })
  })
  return rows
}

// ---------- Axis: "remarks part 1" / "dd-mm-yyyy | [chq |] remarks part 2 | amount | balance[ branch]" ----------

const AXIS_ROW = /^(\d{2}-\d{2}-\d{4}) \| (.*?)(?: ?\| |\s{3,})([\d,]*\.\d{2}) \| (-?[\d,]*\.\d{2})(?:\s+\d{2,5}| \| \d{2,5})?$/

function parseAxis(lines) {
  const rows = []
  let pending = []
  let started = false
  let opening = null
  for (const raw of stripMarkup(lines)) {
    const l = raw.trim()
    if (!l || isNoise(l)) continue
    const open = l.match(/^OPENING BALANCE \| (-?[\d,]*\.\d{2})/i)
    if (open) {
      opening = num(open[1])
      started = true
      pending = []
      continue
    }
    if (!started) continue
    if (/^(CLOSING BALANCE|TRANSACTION TOTAL|Unless the constituent)/i.test(l)) break
    const m = l.match(AXIS_ROW)
    if (m) {
      rows.push({ date: isoFromDots(m[1]), amount: num(m[3]), balance: num(m[4]), description: joinWrapped([...pending, m[2]]) })
      pending = []
    } else {
      pending.push(l)
    }
  }
  return { rows, opening }
}

// PDF lines break mid-word ("BROKENTUSK" / "TECHNOLOGI/INDmon"): join with a space unless the break is inside a token.
function joinWrapped(parts) {
  let out = ''
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    if (!out) out = p
    else if (/[/\-@]$/.test(out) || /^[/]/.test(p)) out += p
    else out += ` ${p}`
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Debit or credit from the balance movement. `opening` is the balance before the first row when known; otherwise the
 * first row's direction is taken from `firstIsCredit`.
 */
function withDirections(rows, opening, firstIsCredit = false, fallback = () => null) {
  let prev = opening
  let breaks = 0
  const out = rows.map((r, i) => {
    let credit
    if (prev === null || prev === undefined) credit = i === 0 ? firstIsCredit : false
    else if (Math.abs(prev + r.amount - r.balance) < 0.011) credit = true
    else if (Math.abs(prev - r.amount - r.balance) < 0.011) credit = false
    else {
      // The bank sometimes prints a same-day reversal pair out of order, so the balance doesn't move by this amount.
      breaks++
      const hint = fallback(r)
      credit = hint !== null ? hint : /\bRVSL|REVERSAL|REFUND|\bREV\b/i.test(`${r.tag || ''} ${r.description}`) || r.balance > prev
    }
    prev = r.balance
    return { ...r, debit: credit ? 0 : r.amount, credit: credit ? r.amount : 0 }
  })
  return { rows: out, breaks }
}

// On busy days the bank prints same-day rows in a different order from the one its running balance was computed in, so
// a single row can't be checked against the row above it. A whole day can: the balance at the end of the day must equal
// the balance at the end of the previous day plus that day's credits minus its debits. Flip the fewest uncertain rows
// needed to make every day add up.
function solveDays(rows, opening) {
  const out = rows.map((r) => ({ ...r }))
  let start = opening
  let unresolved = 0
  let i = 0
  while (i < out.length) {
    let j = i
    while (j + 1 < out.length && out[j + 1].date === out[i].date) j++
    const day = out.slice(i, j + 1)
    const end = day[day.length - 1].balance
    if (start !== null && start !== undefined) {
      const net = (list) => list.reduce((t, r) => t + r.credit - r.debit, 0)
      if (Math.abs(start + net(day) - end) > 0.011) {
        // Rows whose own balance step doesn't fit are the uncertain ones.
        let prev = start
        const doubtful = []
        day.forEach((r, k) => {
          const fits = Math.abs(prev - r.debit + r.credit - r.balance) < 0.011
          if (!fits) doubtful.push(k)
          prev = r.balance
        })
        const pool = doubtful.length ? doubtful : day.map((_, k) => k)
        const cand = pool.length <= 16 ? pool : pool.slice(0, 16)
        let best = null
        const target = end - start
        const base = net(day)
        const flipGain = cand.map((k) => (day[k].credit ? -2 * day[k].credit : 2 * day[k].debit))
        for (let size = 1; size <= cand.length && best === null; size++) {
          const pick = (from, left, sum, chosen) => {
            if (best) return
            if (left === 0) {
              if (Math.abs(base + sum - target) < 0.011) best = chosen.slice()
              return
            }
            for (let x = from; x <= cand.length - left; x++) {
              chosen.push(x)
              pick(x + 1, left - 1, sum + flipGain[x], chosen)
              chosen.pop()
            }
          }
          pick(0, size, 0, [])
        }
        if (best) {
          for (const x of best) {
            const r = day[cand[x]]
            const wasCredit = r.credit > 0
            const amt = r.debit || r.credit
            r.credit = wasCredit ? 0 : amt
            r.debit = wasCredit ? amt : 0
          }
          day.forEach((r, k) => (out[i + k] = r))
        } else unresolved++
      }
    }
    start = end
    i = j + 1
  }
  return { rows: out, unresolvedDays: unresolved }
}

/** Parses a stored statement's text lines. Returns null for a layout it does not know. */
function parseBankStatement(bank, lines, openingHint = null, fallback = () => null) {
  if (bank === 'axis') {
    const { rows, opening } = parseAxis(lines)
    if (!rows.length) return null
    const r = withDirections(rows, opening ?? openingHint, false, fallback)
    const solved = solveDays(r.rows, opening ?? openingHint)
    return { rows: solved.rows, breaks: r.breaks, unresolvedDays: solved.unresolvedDays, opening: opening ?? openingHint }
  }
  if (bank === 'icici') {
    const rows = parseIcici(lines)
    if (!rows.length) return null
    // ICICI prints no opening balance row; infer it from the first row's printed balance and the stated opening.
    const opening = openingHint ?? null
    const first = rows[0]
    const firstIsCredit = opening !== null ? Math.abs(opening + first.amount - first.balance) < 0.011 : /credit|neft|imps.*cr|cms\/|salary|int\.pd|interest/i.test(`${first.tag} ${first.description}`)
    const r = withDirections(rows, opening, firstIsCredit, fallback)
    const start = opening ?? (r.rows[0].balance - r.rows[0].credit + r.rows[0].debit)
    const solved = solveDays(r.rows, start)
    return { rows: solved.rows, breaks: r.breaks, unresolvedDays: solved.unresolvedDays, opening: start }
  }
  return null
}

module.exports = { solveDays, parseIcici, parseAxis, withDirections, parseBankStatement, joinWrapped }
