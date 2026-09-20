import type { KiteSnapshot } from './kite'

const h = (
  tradingsymbol: string,
  quantity: number,
  average_price: number,
  last_price: number,
  close_price: number,
) => ({
  tradingsymbol,
  exchange: 'NSE',
  quantity,
  t1_quantity: 0,
  average_price,
  last_price,
  close_price,
  day_change: +(last_price - close_price).toFixed(2),
})

// Made-up figures so the dashboard can be previewed without a Zerodha connection.
export function demoSnapshot(): KiteSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    errors: {},
    profile: { user_name: 'Sample Trader', user_id: 'DEMO01' },
    margins: {
      equity: {
        net: 48250,
        available: { cash: 48250, live_balance: 48250, opening_balance: 52000 },
        utilised: { debits: 21750 },
      },
    },
    holdings: [
      h('GOLDBEES', 420, 62.4, 77.1, 76.4),
      h('SILVERBEES', 180, 88.2, 119.5, 121.3),
      h('ICICINIFTY', 210, 21.5, 23.6, 23.4),
      h('GOKEX', 45, 118.0, 129.4, 127.1),
      h('ICIL', 60, 96.5, 89.5, 90.8),
      h('JSWENERGY', 8, 690.0, 657.5, 649.2),
      h('KPRMILL', 5, 940.0, 913.0, 921.5),
      h('VTL', 90, 51.9, 51.4, 50.6),
      h('ICICINXT50', 12, 76.0, 76.3, 75.8),
    ],
    positions: {
      net: [
        { tradingsymbol: 'NIFTY26SEP24500CE', exchange: 'NFO', product: 'MIS', quantity: 75, average_price: 112.5, last_price: 131.2, pnl: 1402.5 },
        { tradingsymbol: 'BANKNIFTY26SEP52000PE', exchange: 'NFO', product: 'MIS', quantity: -30, average_price: 245.0, last_price: 262.4, pnl: -522 },
      ],
      day: [],
    },
    orders: [
      { order_id: '2609201', tradingsymbol: 'NIFTY26SEP24500CE', transaction_type: 'BUY', quantity: 75, filled_quantity: 75, status: 'COMPLETE', order_type: 'MARKET', product: 'MIS', price: 0, average_price: 112.5, order_timestamp: '2026-09-18 09:32:14' },
      { order_id: '2609202', tradingsymbol: 'BANKNIFTY26SEP52000PE', transaction_type: 'SELL', quantity: 30, filled_quantity: 30, status: 'COMPLETE', order_type: 'LIMIT', product: 'MIS', price: 245, average_price: 245, order_timestamp: '2026-09-18 10:05:41' },
      { order_id: '2609203', tradingsymbol: 'GOLDBEES', transaction_type: 'BUY', quantity: 50, filled_quantity: 0, status: 'OPEN', order_type: 'LIMIT', product: 'CNC', price: 75.5, average_price: 0, order_timestamp: '2026-09-18 10:41:03' },
      { order_id: '2609204', tradingsymbol: 'ICIL', transaction_type: 'SELL', quantity: 20, filled_quantity: 0, status: 'REJECTED', order_type: 'LIMIT', product: 'CNC', price: 95, average_price: 0, order_timestamp: '2026-09-18 11:12:27' },
    ],
  }
}
