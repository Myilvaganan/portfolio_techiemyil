// Builds a MetaTrader 5 "Trade History Report" in the same layout MT5 writes, but with invented account details and
// trades — real reports contain personal trading history and must not be committed.

export interface FixtureTrade {
  position: string
  symbol: string
  type: 'buy' | 'sell'
  volume: string
  openTime: string
  openPrice: string
  closeTime: string
  closePrice: string
  profit: string
  commission?: string
  swap?: string
  sl?: string
  tp?: string
}

export interface FixtureOptions {
  name?: string
  account?: string
  accountLine?: string
  company?: string
  date?: string
  trades?: FixtureTrade[]
  /** Deposits/withdrawals shown in the Deals table: [time, deal, amount, balanceAfter, comment]. */
  deposits?: [string, string, string, string, string][]
  balance?: string
  equity?: string
}

export const SAMPLE_TRADES: FixtureTrade[] = [
  { position: '1000001', symbol: 'BTCUSD', type: 'buy', volume: '0.01', openTime: '2026.09.22 12:12:05', openPrice: '85866.50', closeTime: '2026.09.22 12:16:12', closePrice: '85901.50', profit: '0.35' },
  { position: '1000002', symbol: 'BTCUSD', type: 'sell', volume: '0.05', openTime: '2026.09.22 16:30:47', openPrice: '85583.50', closeTime: '2026.09.22 17:32:55', closePrice: '85768.97', profit: '-9.27' },
  { position: '1000003', symbol: 'XAUUSD', type: 'buy', volume: '0.01', openTime: '2026.09.24 17:14:39', openPrice: '4270.84', closeTime: '2026.09.24 19:17:48', closePrice: '4282.05', profit: '11.21', sl: '4260.00', tp: '4300.00' },
  { position: '1000004', symbol: 'XAUUSD', type: 'sell', volume: '0.01', openTime: '2026.09.25 10:39:17', openPrice: '4278.15', closeTime: '2026.09.25 10:39:57', closePrice: '4276.49', profit: '1.66' },
  // Held overnight, with a swap charge and a commission.
  { position: '1000005', symbol: 'US30', type: 'buy', volume: '0.10', openTime: '2026.09.23 23:50:10', openPrice: '51500.00', closeTime: '2026.09.24 09:05:00', closePrice: '51480.00', profit: '-2.00', commission: '-0.70', swap: '-0.15' },
]

export const SAMPLE_DEPOSITS: [string, string, string, string, string][] = [
  ['2026.09.21 19:34:40', '5000001', '150.44', '150.44', 'D/D00000001/INR15000/00000001'],
  ['2026.09.23 12:19:51', '5000002', '150.82', '197.77', 'D/D00000002/INR15000/00000002'],
]

const cell = (v: string) => `<td nowrap>${v}</td>`

/** The HTML exactly as MetaTrader lays it out: UTF-16 comes from `toUtf16`, everything else is here. */
export function buildMt5Html(o: FixtureOptions = {}): string {
  const trades = o.trades ?? SAMPLE_TRADES
  const deposits = o.deposits ?? SAMPLE_DEPOSITS
  const account = o.account ?? '12345678'
  const accountLine = o.accountLine ?? `${account}&nbsp;(USD,&nbsp;Demo-Real,&nbsp;real,&nbsp;Hedge)`

  const positionRows = trades
    .map(
      (t) =>
        // Note the blank cell after Type: the real report has one, and the header row does not.
        `<tr align="right">${cell(t.openTime)}${cell(t.position)}${cell(t.symbol)}${cell(t.type)}<td colspan="1"></td>${cell(t.volume)}${cell(t.openPrice)}${cell(t.sl ?? '')}${cell(t.tp ?? '')}${cell(t.closeTime)}${cell(t.closePrice)}${cell(t.commission ?? '0.00')}${cell(t.swap ?? '0.00')}${cell(t.profit)}</tr>`,
    )
    .join('\n')

  const depositRows = deposits
    .map(([time, deal, amount, balance, comment]) => `<tr align="right">${cell(time)}${cell(deal)}${cell('')}${cell('balance')}${cell('')}${cell('')}${cell('')}${cell('')}${cell('')}${cell('0.00')}${cell('0.00')}${cell('0.00')}${cell(amount)}${cell(balance)}${cell(comment)}</tr>`)
    .join('\n')

  const dealRows = trades
    .flatMap((t, i) => [
      `<tr align="right">${cell(t.openTime)}${cell(String(2000000 + i * 2))}${cell(t.symbol)}${cell(t.type)}${cell('in')}${cell(t.volume)}${cell(t.openPrice)}${cell(t.position)}${cell('')}${cell(t.commission ?? '0.00')}${cell('0.00')}${cell('0.00')}${cell('0.00')}${cell('100.00')}${cell('')}</tr>`,
      `<tr align="right">${cell(t.closeTime)}${cell(String(2000001 + i * 2))}${cell(t.symbol)}${cell(t.type === 'buy' ? 'sell' : 'buy')}${cell('out')}${cell(t.volume)}${cell(t.closePrice)}${cell(t.position)}${cell('')}${cell('0.00')}${cell('0.00')}${cell(t.swap ?? '0.00')}${cell(t.profit)}${cell('100.00')}${cell('')}</tr>`,
    ])
    .join('\n')

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
<title>${account}: ${o.name ?? 'Test Trader'} - Trade History Report</title>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-16">
</head>
<body>
<div align="center">
<table cellspacing="1" cellpadding="3" border="0">
<tr align="center"><td colspan="14"><div style="font: 14pt Tahoma"><b>Trade History Report</b><br></div></td></tr>
<tr align="left"><th colspan="4" nowrap align="right">Name:</th><th colspan="10" nowrap align="left"><b>${o.name ?? 'Test Trader'} </b></th></tr>
<tr align="left"><th colspan="4" nowrap align="right">Account:</th><th colspan="10" nowrap align="left"><b>${accountLine}</b></th></tr>
<tr align="left"><th colspan="4" nowrap align="right">Company:</th><th colspan="10" nowrap align="left"><b>${o.company ?? 'Demo Markets Ltd'}</b></th></tr>
<tr align="left"><th colspan="4" nowrap align="right">Date:</th><th colspan="10" nowrap align="left"><b>${o.date ?? '2026.09.26 08:12'}</b></th></tr>
<tr><td nowrap></td><td nowrap></td></tr>
<tr align="center"><th colspan="14"><div style="font: 10pt Tahoma"><b>Positions</b></div></th></tr>
<tr align="center" bgcolor="#E5F0FC"><td><b>Time</b></td><td><b>Position</b></td><td><b>Symbol</b></td><td><b>Type</b></td><td><b>Volume</b></td><td><b>Price</b></td><td><b>S / L</b></td><td><b>T / P</b></td><td><b>Time</b></td><td><b>Price</b></td><td><b>Commission</b></td><td><b>Swap</b></td><td><b>Profit</b></td></tr>
${positionRows}
<tr><td colspan="14"></td></tr>
<tr align="center"><th colspan="14"><div style="font: 10pt Tahoma"><b>Orders</b></div></th></tr>
<tr align="center" bgcolor="#E5F0FC"><td><b>Open Time</b></td><td><b>Order</b></td><td><b>Symbol</b></td><td><b>Type</b></td><td><b>Volume</b></td><td><b>Price</b></td><td><b>S / L</b></td><td><b>T / P</b></td><td><b>Time</b></td><td><b>State</b></td><td><b>Comment</b></td></tr>
<tr align="right">${cell('2026.09.22 12:12:05')}${cell('3000001')}${cell('BTCUSD')}${cell('buy')}${cell('0.01 / 0.01')}${cell('market')}${cell('')}${cell('')}${cell('2026.09.22 12:12:05')}${cell('filled')}${cell('')}</tr>
<tr><td colspan="14"></td></tr>
<tr align="center"><th colspan="14"><div style="font: 10pt Tahoma"><b>Deals</b></div></th></tr>
<tr align="center" bgcolor="#E5F0FC"><td><b>Time</b></td><td><b>Deal</b></td><td><b>Symbol</b></td><td><b>Type</b></td><td><b>Direction</b></td><td><b>Volume</b></td><td><b>Price</b></td><td><b>Order</b></td><td><b>Cost</b></td><td><b>Commission</b></td><td><b>Fee</b></td><td><b>Swap</b></td><td><b>Profit</b></td><td><b>Balance</b></td><td><b>Comment</b></td></tr>
${depositRows}
${dealRows}
<tr align="right">${cell('')}${cell('0.00')}${cell('0.00')}${cell('0.00')}${cell('141.57')}${cell('141.57')}${cell('')}</tr>
<tr><td colspan="14"></td></tr>
<tr align="left"><td><b>Balance:</b></td><td colspan="2">${o.balance ?? '141.57'}</td><td></td><td><b>Free Margin:</b></td><td colspan="2">${o.balance ?? '141.57'}</td></tr>
<tr align="left"><td><b>Credit Facility:</b></td><td colspan="2">0.00</td><td></td><td><b>Margin:</b></td><td colspan="2">0.00</td></tr>
<tr align="left"><td><b>Floating P/L:</b></td><td colspan="2">0.00</td><td></td><td><b>Margin Level:</b></td><td colspan="2">0.00%</td></tr>
<tr align="left"><td><b>Equity:</b></td><td colspan="2">${o.equity ?? '141.57'}</td></tr>
<tr><td colspan="14"></td></tr>
<tr align="center"><th colspan="14"><div style="font: 10pt Tahoma"><b>Results</b></div></th></tr>
<tr align="left"><td><b>Total Net Profit:</b></td><td>-179.75</td><td><b>Gross Profit:</b></td><td>238.10</td><td><b>Gross Loss:</b></td><td>-417.85</td></tr>
<tr align="left"><td><b>Profit Factor:</b></td><td>0.57</td><td><b>Expected Payoff:</b></td><td>-3.99</td></tr>
<tr align="left"><td><b>Recovery Factor:</b></td><td>-0.58</td><td><b>Sharpe Ratio:</b></td><td>-0.15</td></tr>
<tr align="left"><td colspan="14"><b>Balance Drawdown:</b></td></tr>
<tr align="left"><td><b>Balance Drawdown Absolute:</b></td><td>215.92</td><td><b>Balance Drawdown Maximal:</b></td><td>312.57 (117.00%)</td><td><b>Balance Drawdown Relative:</b></td><td>117.00% (312.57)</td></tr>
<tr align="left"><td><b>Total Trades:</b></td><td>45</td><td><b>Short Trades (won %):</b></td><td>22 (72.73%)</td><td><b>Long Trades (won %):</b></td><td>23 (65.22%)</td></tr>
<tr align="left"><td></td><td><b>Profit Trades (% of total):</b></td><td>31 (68.89%)</td><td><b>Loss Trades (% of total):</b></td><td>14 (31.11%)</td></tr>
<tr align="left"><td></td><td><b>Largest profit trade:</b></td><td>35.90</td><td><b>Largest loss trade:</b></td><td>-125.11</td></tr>
</table>
</div>
</body>
</html>`
}

/** UTF-16LE with a byte-order mark: how MetaTrader writes the file on most builds. */
export function toUtf16(html: string): ArrayBuffer {
  const bytes = new Uint8Array(2 + html.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let i = 0; i < html.length; i++) {
    const c = html.charCodeAt(i)
    bytes[2 + i * 2] = c & 0xff
    bytes[3 + i * 2] = c >> 8
  }
  return bytes.buffer
}
