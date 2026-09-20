# Admin Vault Lambda

Backend for the hidden `/admin` document vault on techiemyil.com — a
login-gated personal document store (certificates, payslips, Form 16, etc.)
backed by a private S3 bucket. Handles login, listing, and presigned
upload/download URLs. No database: each S3 object key encodes its tag and
original filename (`{tag}/{iso-timestamp}__{filename}`), so listing is a
single `ListObjectsV2` call.

Uses AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) —
these must be bundled with the deployment zip (unlike the dependency-free
`visit`/`myva` lambdas), since the presigner package isn't guaranteed to be
present in the managed Node runtime layer.

## Currently deployed

This is already live in AWS account `905418329604` (ap-south-1):

| Resource | Name / ID |
|---|---|
| Lambda function | `admin-vault` |
| IAM execution role | `admin-vault-lambda-role` (`AWSLambdaBasicExecutionRole` + inline policy scoped to `s3:GetObject`/`s3:PutObject`/`s3:DeleteObject`/`s3:ListBucket` on the vault bucket only) |
| API Gateway (HTTP API) | `admin-vault-api` (`uie2mufwti`) |
| Invoke URL | `https://uie2mufwti.execute-api.ap-south-1.amazonaws.com` |
| S3 bucket | `techiemyil-admin-vault` (private, Block Public Access on, SSE-S3 default encryption, versioning on, TLS-only bucket policy) |
| `ALLOWED_ORIGINS` | `https://techiemyil.com,https://www.techiemyil.com,https://portfolio.techiemyil.com,http://localhost:5173,http://localhost:4173` |

**Two separate CORS configs must both list the site's origins, or uploads
silently fail:** the Lambda's `ALLOWED_ORIGINS` / the API Gateway CORS config
(covering `/admin/login`, `/admin/documents`, etc.) *and* the S3 bucket's own
CORS rule (covering the direct browser→S3 `PUT` for uploads, which bypasses
the Lambda entirely). The site is actually served from
`https://portfolio.techiemyil.com` — that origin was missing from the S3
bucket CORS rule while the Lambda/API Gateway had it, so login and listing
worked but the upload `PUT` was silently blocked by the browser. Keep the S3
bucket's `AllowedOrigins` in sync with `ALLOWED_ORIGINS` above:
```bash
aws s3api put-bucket-cors --bucket techiemyil-admin-vault --region ap-south-1 --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"], "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["https://techiemyil.com","https://www.techiemyil.com","https://portfolio.techiemyil.com","http://localhost:5173","http://localhost:4173"],
    "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000
  }]
}'
```

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET` are already set as
real values on the function (the password was generated and shared with the
site owner directly — it is not recorded in this repo). To rotate them:

```bash
aws lambda update-function-configuration \
  --function-name admin-vault \
  --region ap-south-1 \
  --environment "Variables={ADMIN_USERNAME=<user>,ADMIN_PASSWORD=<new-password>,ADMIN_JWT_SECRET=<new-secret>,S3_BUCKET=techiemyil-admin-vault,ALLOWED_ORIGINS=https://techiemyil.com\,https://www.techiemyil.com\,https://portfolio.techiemyil.com\,http://localhost:5173\,http://localhost:4173}"
```

(`update-function-configuration` replaces the whole `Variables` map, so keep
all five keys in the command. Generate a new secret with `openssl rand -hex
32` — rotating it invalidates all existing login sessions.)

The API Gateway stage has access logging enabled to
`/aws/apigateway/admin-vault-api` (30-day retention), logging only
`requestId`, `status`, and `error.message` — no request/response bodies, no
S3 keys, no PII.

## Deploying from scratch elsewhere

1. **Create the S3 bucket**
   ```bash
   aws s3api create-bucket --bucket <bucket-name> --region <region> \
     --create-bucket-configuration LocationConstraint=<region>
   aws s3api put-public-access-block --bucket <bucket-name> \
     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   aws s3api put-bucket-encryption --bucket <bucket-name> --server-side-encryption-configuration \
     '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
   aws s3api put-bucket-versioning --bucket <bucket-name> --versioning-configuration Status=Enabled
   ```
   Then apply a TLS-only bucket policy and a CORS rule allowing `PUT` from
   your site's origins (see the JSON shapes used for `techiemyil-admin-vault`
   — deny `s3:*` when `aws:SecureTransport` is `false`; CORS `AllowedMethods:
   ["PUT"]`, `AllowedOrigins` = your site's origins).

2. **Create the IAM role**
   - Trust policy: `lambda.amazonaws.com`
   - Attach `AWSLambdaBasicExecutionRole`
   - Inline policy: `s3:ListBucket` on the bucket ARN, `s3:GetObject` +
     `s3:PutObject` + `s3:DeleteObject` on `<bucket-arn>/*`

3. **Package and create the function**
   ```bash
   cd lambda/admin-vault
   npm install --omit=dev
   zip -X -r admin-vault-lambda.zip index.js package.json node_modules
   aws lambda create-function \
     --function-name admin-vault \
     --runtime nodejs20.x \
     --role <role-arn> \
     --handler index.handler \
     --timeout 15 --memory-size 256 \
     --zip-file fileb://admin-vault-lambda.zip \
     --region <region> \
     --environment "Variables={ADMIN_USERNAME=<user>,ADMIN_PASSWORD=<password>,ADMIN_JWT_SECRET=<openssl-rand-hex-32>,S3_BUCKET=<bucket-name>,ALLOWED_ORIGINS=<origins>}"
   ```

4. **Create the HTTP API**
   ```bash
   aws apigatewayv2 create-api --name admin-vault-api --protocol-type HTTP \
     --target <lambda-arn> --region <region> \
     --cors-configuration AllowOrigins=<origins>,AllowMethods=GET,POST,DELETE,OPTIONS,AllowHeaders=Content-Type,Authorization
   ```
   This creates a `$default` route + auto-deployed `$default` stage pointing
   at the Lambda (payload format 2.0).

5. **Grant API Gateway permission to invoke the Lambda** — the quick-create
   path does **not** attach this automatically (verify with `aws lambda
   get-policy --function-name admin-vault`):
   ```bash
   aws lambda add-permission \
     --function-name admin-vault \
     --statement-id apigateway-admin-vault-invoke \
     --action lambda:InvokeFunction \
     --principal apigateway.amazonaws.com \
     --source-arn "arn:aws:execute-api:<region>:<account-id>:<api-id>/*" \
     --region <region>
   ```
   Note the `/*` suffix (matching the whole API, not a narrower
   `/*/*/*` per-stage/method/path pattern) — the more specific pattern was
   tested and silently failed to authorize invocation for this HTTP API, so
   use the single-wildcard form.

6. **Wire it into the frontend** — set `VITE_ADMIN_API_URL` in the site's
   `.env` to the invoke URL (no path suffix; routes are `/admin/login` etc.).

## Redeploying code after edits

```bash
cd lambda/admin-vault
npm install --omit=dev
zip -X -r admin-vault-lambda.zip index.js package.json node_modules
aws lambda update-function-code \
  --function-name admin-vault \
  --zip-file fileb://admin-vault-lambda.zip \
  --region ap-south-1
rm admin-vault-lambda.zip
```

## Request / response shape

```
POST /admin/login
{ "username": "...", "password": "..." }
200 { "token": "<hmac-signed session token>", "expiresAt": <epoch ms> }
401 { "error": "Invalid username or password." }
```

All routes below require `Authorization: Bearer <token>` — 401 if missing/
invalid/expired (tokens are valid 7 days from issue).

```
GET /admin/documents
200 { "documents": [{ "key", "tag", "filename", "size", "lastModified" }] }

POST /admin/documents/upload-url
{ "filename": "...", "tag": "...", "contentType": "..." }
200 { "uploadUrl": "<presigned S3 PUT url, 5 min>", "key": "..." }
# Client then PUTs the file bytes directly to uploadUrl with the same
# Content-Type — the Lambda never sees the file contents.

GET /admin/documents/download-url?key=<key>&mode=preview|download
200 { "url": "<presigned S3 GET url, 2 min>" }
# mode=download sets Content-Disposition: attachment; mode=preview (default)
# sets inline, for use in an <iframe>/<img> preview.

DELETE /admin/documents?key=<key>
200 { "ok": true }
```

## Zerodha Kite Connect (`/admin/zerodha`)

The same function proxies Kite Connect for the admin Zerodha dashboard. Kite's
API sends no CORS headers and the session exchange needs the API secret, so
the browser can't call it directly. Set two more environment variables
(keep them out of the repo and `.env`):

| Variable | Value |
|---|---|
| `KITE_API_KEY` | API key from the Kite Connect developer console |
| `KITE_API_SECRET` | API secret from the same app |

`update-function-configuration` replaces the whole `Variables` map — read the
current map first and merge, don't overwrite.

In the Kite developer console set the app's **Redirect URL** to
`https://portfolio.techiemyil.com/admin/zerodha` (Kite allows one; use
`http://localhost:5173/admin/zerodha` temporarily for local dev).

All routes require the normal admin `Authorization: Bearer` token:

```
GET  /admin/kite/login-url                  200 { "url": "<kite login url>" }
POST /admin/kite/session   { requestToken } 200 { accessToken, userId, userName, ... }
POST /admin/kite/snapshot  { accessToken }  200 { profile, margins, holdings, positions, orders, errors, fetchedAt }
                                            403 { code: "token_expired" } when Kite rejects the token
POST /admin/kite/logout    { accessToken }  200 { ok: true }   # revokes the Kite session
```

The access token is never stored server-side: the browser keeps it in
`sessionStorage` (Kite expires it around 6 AM IST) and sends it with each
snapshot request. It is never logged.

## Options trade history (`/admin/options-analytics`)

Trades imported from broker tradebook exports (Zerodha, Dhan, ICICI Direct,
Groww, Pocketful, INDmoney, or any custom broker) are parsed in the browser —
columns and contract names are normalised to NSE-style symbols there — and
stored per broker as one JSON object in the vault bucket:

| Broker | Key |
|---|---|
| `zerodha` (default) | `_data/options-fills.json` |
| any other id (`^[a-z0-9-]{2,24}$`) | `_data/options-fills-<id>.json` |

The bucket is versioned, SSE-S3 and private. The `_data/` prefix is hidden
from the document list and rejected by the document download/delete routes.
Uploads are merged and de-duplicated server-side (`id|symbol|ts`), so
re-importing or importing from two devices never overwrites anything. No IAM
changes are needed — the existing bucket permissions cover it.

```
GET    /admin/options/brokers                      200 { "brokers": [ { broker, size } ] }
GET    /admin/options/fills?broker=<id>            200 { broker, fills: [ { id, orderId, symbol, side, qty, price, ts, date, time } ] }
POST   /admin/options/fills?broker=<id> { fills }  200 { added, skipped, total }   # max 10,000 per request
DELETE /admin/options/fills?broker=<id>            200 { ok: true }
```

`broker` defaults to `zerodha` when omitted.

## Bank & credit-card statements (`/admin/bank-statements`, `/admin/credit-cards`)

`statements.js` handles ICICI/Axis account statements and ICICI credit-card statements. Each step is its own request so it stays under API Gateway's 30 s limit:

1. `POST /admin/statements/upload-url {kind, contentType}` → presigned S3 PUT (`kind` is `bank` or `card`). The browser uploads the file directly.
2. `POST /admin/statements/prepare {kind, id, password?}` → opens the PDF with [MuPDF](https://www.npmjs.com/package/mupdf) (WASM, **AGPL-3.0** — fine for this private, unmodified use, but keep in mind if the backend is ever distributed), unlocks it with the password (used once, never stored or logged), saves the **unlocked** copy as `_data/statements/<kind>/<id>/statement.pdf`, deletes the locked original, and stores text rows. `422 {code: password_required | wrong_password}` when the PDF is locked.
3. `POST /admin/statements/extract {kind, id, chunk: 'meta' | n}` → one OpenAI call per ~30 text rows (plus one for the statement header). Account/card numbers and PAN are masked before text leaves the Lambda; requests use `store: false`.
4. `POST /admin/statements/commit {kind, id, filename, meta, transactions}` → merges into `_data/statements/<kind>/data.json`. Re-uploading the same account/period replaces the earlier statement; overlapping statements are de-duplicated.
5. `GET /admin/statements/data?kind=` · `DELETE /admin/statements?kind=&id=` · `GET /admin/statements/file-url?kind=&id=` (presigned link to the unlocked PDF).
6. `POST /admin/statements/insights {kind, context, fingerprint, fast?}` and `POST /admin/statements/ask {kind, question, context}` → strongest model, on aggregated numbers only. Insights are stored with the data fingerprint so they reload without another AI call.

Environment variables (in addition to the ones above):

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | required |
| `OPENAI_MODEL_EXTRACT` | `gpt-5.4-mini` | reads transactions (60-row test: exact amounts, 60/60 categories, ~13 s) |
| `OPENAI_MODEL_INSIGHTS` | `gpt-5.4-mini` | insights and Q&A (~5 s). Set to `gpt-6-astra` for deeper analysis (~20 s, several times the cost) |
| `OPENAI_MODEL_FAST` | `gpt-5.4-mini` | fallback when the insights model times out |

Function settings: memory **1024 MB**, timeout **29 s**. The bucket needs no extra IAM permissions or CORS changes.

## Loans (`/admin/loans`)

ICICI loan **account statements** and **amortization schedules** are stored as the third vault type (`kind=loan`).
Loan PDFs need no AI: the same upload → `prepare` flow unlocks the PDF (password used once, never stored) and keeps
the unlocked copy at `_data/statements/loan/<id>/statement.pdf`, but `prepare` returns the extracted text rows and
**the browser reads them deterministically** (`src/lib/loanParser.ts`). Only loan numbers, dates and amounts are
sent back to `commit` — PAN, phone, address and e-mail are never picked up or stored. No `text.json` is kept.

`POST /admin/statements/commit {kind: 'loan', id, filename, pages, parsed}` validates and stores the parsed document
in `_data/statements/loan/data.json` (`statements[]`, each holding its `parsed` schedule rows or statement details,
summary and payment events). Re-uploading a newer document of the same type for the same loan replaces the old one.
`insights` / `ask` accept `kind: 'loan'` with compact aggregates (balances, rates, what-if results) — never
identifiers. Everything else (data, delete, file-url) is shared with bank and card statements.
