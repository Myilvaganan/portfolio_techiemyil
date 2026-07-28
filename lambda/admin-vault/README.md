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
| IAM execution role | `admin-vault-lambda-role` (`AWSLambdaBasicExecutionRole` + inline policy scoped to `s3:GetObject`/`s3:PutObject`/`s3:ListBucket` on the vault bucket only) |
| API Gateway (HTTP API) | `admin-vault-api` (`uie2mufwti`) |
| Invoke URL | `https://uie2mufwti.execute-api.ap-south-1.amazonaws.com` |
| S3 bucket | `techiemyil-admin-vault` (private, Block Public Access on, SSE-S3 default encryption, versioning on, TLS-only bucket policy) |
| `ALLOWED_ORIGINS` | `https://techiemyil.com,https://www.techiemyil.com,http://localhost:5173,http://localhost:4173` |

`ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET` are already set as
real values on the function (the password was generated and shared with the
site owner directly — it is not recorded in this repo). To rotate them:

```bash
aws lambda update-function-configuration \
  --function-name admin-vault \
  --region ap-south-1 \
  --environment "Variables={ADMIN_USERNAME=<user>,ADMIN_PASSWORD=<new-password>,ADMIN_JWT_SECRET=<new-secret>,S3_BUCKET=techiemyil-admin-vault,ALLOWED_ORIGINS=https://techiemyil.com\,https://www.techiemyil.com\,http://localhost:5173\,http://localhost:4173}"
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
     `s3:PutObject` on `<bucket-arn>/*`

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
     --cors-configuration AllowOrigins=<origins>,AllowMethods=GET,POST,OPTIONS,AllowHeaders=Content-Type,Authorization
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
```
