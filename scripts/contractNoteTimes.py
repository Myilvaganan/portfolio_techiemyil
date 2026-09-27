#!/usr/bin/env python3
"""Fill in missing trade times from ICICI Direct F&O contract notes.

  python3 scripts/contractNoteTimes.py             # dry run: lists what would change
  python3 scripts/contractNoteTimes.py --apply     # saves the times

Reads every PDF in src/ContractNotes/ (git-ignored). Needs JOURNAL_TOKEN (the admin login token) in the environment.
Only trades with no time (or 00:00) are touched; overnight trades are left blank, as the app does on purpose.
"""
import glob, json, os, re, sys, urllib.request
import pypdf

API = re.search(r'VITE_ADMIN_API_URL=(\S+)', open('.env').read()).group(1)
TOKEN = os.environ.get('JOURNAL_TOKEN')
APPLY = '--apply' in sys.argv
RX = re.compile(r'(\d+) (\d\d:\d\d:\d\d)(\S+-(?:CE|PE)-\S+)\s+([\d.]+)\s+[\d.]+\s+[\d.]+\s+\S?\s?(\d+)(Buy|Sell)')
MON = {m: i + 1 for i, m in enumerate('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}

def fills():
    out = {}
    for f in sorted(glob.glob('src/ContractNotes/*.pdf')):
        t = ''.join(p.extract_text() + '\n' for p in pypdf.PdfReader(f).pages).replace('-\n', '-')
        d = re.search(r'TRADE DATE\s*:\s*(\d\d)-(\w{3})-(\d{4})', t)
        date = f'{d.group(3)}-{MON[d.group(2).upper()]:02d}-{d.group(1)}'
        for m in RX.finditer(t):
            u, kind, exp, right, strike = m.group(3).split('-')
            key = (date, u, f'{exp[5:]}-{MON[exp[2:5]]:02d}-{exp[:2]}', right, float(strike))
            out.setdefault(key, []).append((m.group(2), m.group(6), float(m.group(4))))
    return out

def call(path, method='GET', body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', **({'Content-Type': 'application/json'} if body else {})})
    return json.load(urllib.request.urlopen(req))

if not TOKEN: sys.exit('Set JOURNAL_TOKEN first.')
F = fills()
print(f'{sum(map(len, F.values()))} fills from contract notes')
trades = call('/admin/journal/data')['trades']
changes, skipped, used = [], [], set()
for t in trades:
    if t.get('account') or t.get('time') not in ('', '00:00', None): continue
    m = re.match(r'(\S+) ([\d.]+) (CE|PE) · (\d{4}-\d\d-\d\d)$', t.get('symbol', ''))
    if not m: continue
    cands = F.get((t['date'], m.group(1), m.group(4), m.group(3), float(m.group(2))), [])
    side = 'Buy' if t['direction'] == 'BUY' else 'Sell'
    # Each fill opens at most one trade: take the unused one nearest the trade's entry price, earliest first.
    same = sorted(c for c in cands if c[1] == side and (t['date'], c) not in used)
    near = [c for c in same if t.get('entry') is not None and abs(c[2] - t['entry']) < 0.05]
    pick = (near or [None])[0]
    if pick:
        used.add((t['date'], pick))
        changes.append((t, pick[0][:5]))
    else: skipped.append(t)
for t, hhmm in changes: print(f"{t['date']}  {t['symbol']:<40} -> {hhmm}")
print(f'\n{len(changes)} trades would get a time; {len(skipped)} without a same-day opening fill (overnight or not in these notes)')
if APPLY:
    for t, hhmm in changes: call('/admin/journal/trade', 'POST', {'trade': {**t, 'time': hhmm}, 'previousDate': t['date']})
    print('Saved.')
else:
    print('Dry run only. Re-run with --apply to save.')
