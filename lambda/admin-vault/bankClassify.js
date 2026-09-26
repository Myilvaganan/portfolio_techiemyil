// Turns a parsed bank-statement row into { merchant, category, channel } without guessing.
//
// The payee is read from the transaction's own text (UPI payee name / VPA, NEFT beneficiary, biller) and the category
// comes from explicit rules on that text. Anything the rules don't recognise stays "Other" with the payee name kept, so
// it can be corrected once from the app rather than being silently filed under the wrong heading.

const GENERIC_TAGS = /^(bil payment|fund transfer|credit trxn|debit trxn|idirect trxn|atm trxn|visa trxn|trxn|family|self|na|upi|payment|paid via cred|payment from ph.*|\d[\d\s-]*)$/i

// [test on lowercased "payee description", merchant name, category]. First match wins, so specific rules go first.
const RULES = [
  // Money moving between my own accounts and to family is never spending.
  [/s ?myilvag|myilvaganan|self\b|own account|a\/c transfer to self/, 'Own account', 'Transfer'],
  [/zerodha|nse clearing|nsdl|cdsl|mfss|groww|upstox|angel one|icici ?direct|idirect|iccl|indian clearing|kotak securities|coin by|smallcase|kuvera|brokentusk|demat|raise secu/, 'Investments', 'Investments'],
  [/closure proceeds|rev sweep|sweep|fixed dep|\bfd\b|\brd\b|recurring dep|flexi/, 'Deposit / sweep', 'Transfer'],
  [/\brent\b|house rent|room rent|pg rent|rent for|home rent|appu ?samy|vis?h?alak|visalakshi/, 'Rent', 'Rent'],
  [/icici prudential|hdfc life|lic of india|life insur|licofindia|max life|sbi life|star health|policybazaar|acko|digit insur|niva bupa|tata aia|bajaj allianz|insurance/, 'Insurance', 'Insurance'],
  // Fuel and vehicle.
  [/indian ?oil|iocl|hpcl|bpcl|bharat petroleum|hindustan petroleum|shell|nayara|petrol|fuels?\b|filling station|bunk/, 'Petrol bunk', 'Fuel'],
  [/royal enfield|bike servi|two ?wheeler|tvs motor|bajaj auto|honda motor|yamaha|hero motocorp|garage|motors\b/, 'Vehicle service', 'Transport'],
  [/fastag|nhai|toll/, 'FASTag', 'Transport'],
  [/rapido|\bola\b|olacabs|ani technologies|uber|namma ?yatri|redbus|abhibus|irctc|indian railways|makemytrip|goibibo|ixigo|cleartrip|indigo|air india|akasa|vistara/, 'Travel', 'Travel'],
  [/bmtc|metro|msrtc|tnstc|ksrtc|setc|bus\b/, 'Transport', 'Transport'],
  // Food, groceries, shopping.
  [/zomato|swiggy(?! ?ins)|eatsure|hungerbox|dominos|domino's|kfc|mcdonald|pizza|burger|biryani|cafe|coffee|starbucks|restaurant|hotel|mess\b|bakery|\btea\b|juice|foods?\b|dhaba|kitchen|sweets|sagar|udupi|saravana/, 'Food & dining', 'Food & Dining'],
  [/instamart|swiggy ins|blinkit|zepto|bigbasket|bb ?now|dunzo|jiomart|dmart|d-mart|reliance retail|reliance fresh|more retail|supermarket|super market|provision|grocer|vegetable|fruits|milk|dairy|nilgiris|spencer|ratnadeep|wholesale mart|kirana|store\b|mart\b/, 'Groceries', 'Groceries'],
  // Gold savings schemes and digital gold, before the jewellery/shopping rule below.
  [/khaz?ana|avr ?gold|augmont|safegold|digigold|digital gold|gold (savings|scheme|plan|coin)|mmtc/, 'Gold Savings', 'Gold Savings'],
  [/amazon|amzn|flipkart|myntra|ajio|meesho|nykaa|croma|reliance digital|lenskart|decathlon|tata cliq|shoppers stop|lifestyle|pantaloons|max fashion|westside|zudio|jewel|khazana|thangamayil|tanishq|malabar|joyalukkas|silks|textile|readymade|garments|footwear|bata|khadim|electronics|mobile|ecommerce|shop\b|shopping/, 'Shopping', 'Shopping'],
  // Bills and subscriptions.
  [/bescom|bangalore electricity|tangedco|tnpdcl|tneb|electricity|eb bill|power bill|cesc|msedcl|bses/, 'Electricity', 'Bills & Utilities'],
  [/indane|bharat ?gas|hp ?gas|\blpg\b|gas agency|gas booking/, 'Cooking gas', 'Bills & Utilities'],
  [/airtel|jio\b|reliance jio|vodafone|vi\b|bsnl|act fiber|hathway|tata play|dish ?tv|d2h|recharge|prepaid|postpaid|broadband|mobile bill|telecom|water bill|metro water|bwssb|piped gas|mgl|igl\b/, 'Mobile & utilities', 'Bills & Utilities'],
  [/netflix|hotstar|disney|prime video|amazon prime|spotify|youtube|apple|itunes|google ?play|google one|jiocinema|sony ?liv|zee5|audible|canva|openai|chatgpt|github|notion|adobe|microsoft|icloud|dropbox|linkedin|godaddy|aws\b|amazon web|digitalocean|cloudflare|namecheap|hostinger|mandate/, 'Subscription', 'Subscriptions'],
  // Bill payments come after rent and loans: "BIL/…/Rent/…" is a rent transfer made through the bill-pay screen.
  [/credpay|cred club|bbps|bil\/|bill pay|billdesk|paytm bill/, 'Bill payment', 'Bills & Utilities'],
  // Health, education, entertainment.
  [/apollo|pharmacy|pharma|medplus|medical|hospital|clinic|diagnostic|\blab\b|1mg|netmeds|pharmeasy|dental|doctor/, 'Healthcare', 'Health'],
  [/school|college|university|tuition|coaching|udemy|coursera|byju|unacademy|fees? ?- ?edu|\bexam\b/, 'Education', 'Education'],
  [/pvr|inox|cinepolis|bookmyshow|movie|theatre|theater|dream11|mpl\b|games?\b|steam|playstation|amusement|park\b/, 'Entertainment', 'Entertainment'],
  // Housing and loans.
  [/emi\b|loan|capitalflo|bajaj finance|bajaj fin|home credit|hdb ?fin|kreditbee|moneyview|lazypay|simpl\b|slice\b|amazon pay later|pay later|paylater|personal loan|ecs|ach d|nach/, 'Loan / EMI', 'EMI & Loans'],
  [/credit ?card|card payment|cc payment|billpay.*card|autopay.*card/, 'Credit card bill', 'Bills & Utilities'],
  // Cash, charges, taxes, income.
  [/cash wdl|cash withdrawal|\batm\b|nfs\/cash/, 'ATM', 'Cash Withdrawal'],
  [/\bgst\b|cgst|sgst|charges|\bchg\b|fee\b|fees\b|sms alert|\bamc\b|annual|penalty|return chg|rtn ?chg|min bal|debit card|dr card|cardcharges|processing/, 'Bank charges', 'Fees & Charges'],
  [/income tax|itd|tds|advance tax|gst payment|cbdt|tax payment/, 'Tax', 'Taxes'],
  [/int\.?pd|interest|int\.? credit|int\.? on|\bint\b|sb int/, 'Bank interest', 'Interest'],
  [/salary|sal\/|payroll|motherson|cms\/|cgi|infosys|wipro|tcs\b|solium|hsbc|neft.*(ltd|limited|pvt|technolog)|\bnre\b/, 'Salary / employer', 'Salary'],
]

const CATEGORIES = new Set(['Salary', 'Other Income', 'Interest', 'Refund', 'Transfer', 'Rent', 'EMI & Loans', 'Investments', 'Insurance', 'Gold Savings', 'Groceries', 'Food & Dining', 'Shopping', 'Transport', 'Fuel', 'Travel', 'Bills & Utilities', 'Subscriptions', 'Health', 'Education', 'Entertainment', 'Cash Withdrawal', 'Fees & Charges', 'Taxes', 'Other'])

function channelOf(desc) {
  const d = desc.toUpperCase()
  if (/^UPI\b|\/UPI\//.test(d)) return 'UPI'
  if (/^IMPS|^MMT\/IMPS|\bIMPS\b/.test(d)) return 'IMPS'
  if (/^NEFT/.test(d)) return 'NEFT'
  if (/^RTGS/.test(d)) return 'RTGS'
  if (/^NFS|^ATM\b|CASH WDL/.test(d)) return 'ATM'
  if (/^(VPS|VIN|VSI|POS|IPS|RPI)\b/.test(d) || /^VISA/.test(d)) return 'Card'
  if (/^ACH|^ECS|NACH|MANDATE/.test(d)) return 'Auto-debit'
  if (/^CHQ|^CLG|CHEQUE/.test(d)) return 'Cheque'
  if (/INT\.?PD|INTEREST/.test(d)) return 'Interest'
  if (/^EBA|^BIL|^INF\b|^CMS|^IIN/.test(d)) return 'Other'
  return 'Other'
}

const title = (s) =>
  s
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())

// The name of the other party, straight from the text.
function payeeOf(desc, tag) {
  const t = (tag || '').trim()
  if (t && !GENERIC_TAGS.test(t) && !/^[a-z0-9._-]+@[a-z]+$/i.test(t)) return t
  const parts = desc.split('/')
  const up = (parts[0] || '').toUpperCase()
  if (up === 'UPI') {
    // Axis: UPI/P2M/<ref>/<payee>/...   ICICI: UPI/<payee>/<vpa>/... or UPI/<ref>/<note>/<vpa>/...
    const isRef = (s) => /^\d{8,}$/.test(s)
    if (/^P2[AMV]$/.test((parts[1] || '').toUpperCase())) return parts[3] || parts[2] || ''
    if (isRef(parts[1] || '')) return parts[3] && !/^UPI$/i.test(parts[3]) ? parts[3] : parts[2] || ''
    return parts[1] || ''
  }
  if (up === 'IMPS' || up.startsWith('MMT')) return parts[3] || ''
  if (up.startsWith('NEFT')) return (parts[0].split('-')[2] || parts[1] || '').trim()
  if (up === 'BIL') return parts[2] || 'Bill payment'
  return parts.slice(1, 3).join(' ').trim() || desc
}

/**
 * @param {{description: string, tag?: string, debit: number, credit: number}} row
 * @returns {{merchant: string, category: string, channel: string}}
 */
function classifyBankRow(row) {
  const desc = String(row.description || '')
  const payee = payeeOf(desc, row.tag)
  const hay = `${payee} ${row.tag || ''} ${desc}`.toLowerCase()
  const channel = channelOf(desc)

  let hit = RULES.find(([re]) => re.test(hay))
  // A credit is only Salary or Interest when the text says so; otherwise it is money in from someone.
  let category = hit ? hit[2] : row.credit ? 'Other Income' : 'Other'
  let merchant = hit ? hit[1] : ''
  if (row.credit && hit && !['Salary', 'Interest', 'Transfer', 'Investments', 'Refund'].includes(category)) category = /refund|reversal|rvsl|revers/.test(hay) ? 'Refund' : 'Other Income'
  if (/refund|reversal|\brvsl\b|\brev\b/.test(hay) && row.credit) category = 'Refund'

  const name = title(payee.replace(/^\d+$/, '').replace(/@.*$/, ''))
  // Known-brand rules give a clean brand; for everything else keep the real payee name.
  const brand = BRAND.find(([re]) => re.test(hay))
  merchant = brand ? brand[1] : name || merchant || 'Unknown'
  if (!CATEGORIES.has(category)) category = 'Other'
  return { merchant: merchant.slice(0, 60), category, channel }
}

const BRAND = [
  [/zomato/, 'Zomato'], [/swiggy ins|instamart/, 'Swiggy Instamart'], [/swiggy/, 'Swiggy'], [/blinkit/, 'Blinkit'], [/zepto/, 'Zepto'], [/bigbasket|bb ?now/, 'BigBasket'],
  [/hungerbox/, 'HungerBox'], [/rapido/, 'Rapido'], [/\bola\b|olacabs|ani technologies/, 'Ola'], [/uber/, 'Uber'], [/namma ?yatri/, 'Namma Yatri'],
  [/amazon pay later|amznlpa/, 'Amazon Pay Later'], [/amazon prime/, 'Amazon Prime'], [/amazon|amzn/, 'Amazon'], [/flipkart/, 'Flipkart'], [/myntra/, 'Myntra'], [/ajio/, 'Ajio'], [/meesho/, 'Meesho'],
  [/netflix/, 'Netflix'], [/apple|itunes/, 'Apple'], [/google ?play|google one/, 'Google'], [/spotify/, 'Spotify'], [/youtube/, 'YouTube'], [/hotstar|disney/, 'Disney+ Hotstar'],
  [/zerodha|iccl|indian clearing/, 'Zerodha'], [/nse clearing|mfss/, 'NSE Clearing (MF)'], [/icici ?direct|idirect/, 'ICICI Direct'], [/groww/, 'Groww'],
  [/indian ?oil|iocl(?! ?indane)/, 'Indian Oil'], [/hpcl/, 'HPCL'], [/bpcl|bharat petroleum/, 'Bharat Petroleum'], [/shell/, 'Shell'],
  [/indane/, 'Indane Gas'], [/bescom|bangalore electricity/, 'BESCOM'], [/tangedco|tnpdcl|tneb/, 'TANGEDCO'],
  [/airtel/, 'Airtel'], [/reliance jio|\bjio\b/, 'Jio'], [/vodafone|\bvi\b/, 'Vi'],
  [/credpay|cred club|\bcred\b/, 'CRED'], [/appu ?samy/, 'Appusamy (Salem rent)'], [/vis?h?alak|visalakshi/, 'Visalakshi (Bengaluru rent)'],
  [/pvr|inox/, 'PVR INOX'], [/bookmyshow/, 'BookMyShow'], [/dream11/, 'Dream11'], [/irctc/, 'IRCTC'], [/redbus/, 'redBus'],
  [/lic of india|licofindia|life insur/, 'LIC'], [/apollo/, 'Apollo'], [/royal enfield/, 'Royal Enfield'],
]

module.exports = { classifyBankRow, payeeOf, channelOf, RULES }
