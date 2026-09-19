# Visit Alert Lambda

Two routes on one function:

- `POST /visit` — sends a Telegram message to the site owner whenever a
  visitor loads techiemyil.com, once per device per day (dedup below).
- `POST /download` — sends a Telegram message **and** an email (SES) whenever
  someone downloads the resume, saying who they are (name required; email and
  reason optional). See [Resume download alerts](#resume-download-alerts).

The visit alert is deduped two ways:

- Client-side in [`src/lib/visit.ts`](../../src/lib/visit.ts) via
  `localStorage`, so refreshes and route changes within the same day don't
  even make a request.
- Server-side in this Lambda via a DynamoDB table (`visit-dedup`), keyed by
  a SHA-256 hash of `sourceIp + User-Agent` with a same-day cutoff. This
  catches the cases `localStorage` misses — incognito/private tabs and
  cleared site data — while still treating different devices behind the
  same IP (e.g. two phones on the same WiFi) as separate visitors, since
  they carry different User-Agent strings.

Uses AWS SDK v3 (`@aws-sdk/client-dynamodb`) for the dedup table, which is
pre-installed in the Lambda Node.js 18.x/20.x runtime layer — otherwise no
dependencies required (uses Node's built-in `fetch` for Telegram).

## Currently deployed

This is already live in AWS account `905418329604` (ap-south-1):

| Resource | Name / ID |
|---|---|
| Lambda function | `visit-alert` |
| IAM execution role | `myva-lambda-role` (shared with the MYVA lambda — `AWSLambdaBasicExecutionRole` + inline policy `visit-dedup-dynamodb` scoped to `dynamodb:PutItem` on the `visit-dedup` table only) |
| API Gateway (HTTP API) | `visit-alert-api` (`fn46m7ogx7`) |
| Invoke URL | `https://fn46m7ogx7.execute-api.ap-south-1.amazonaws.com/visit` |
| DynamoDB table | `visit-dedup` (on-demand billing, TTL enabled on `expiresAt`, ~2-day retention) |
| `ALLOWED_ORIGINS` | `https://techiemyil.com,https://www.techiemyil.com,https://portfolio.techiemyil.com,http://localhost:5173,http://localhost:4173` |
| `VISIT_DEDUP_TABLE` | unset (defaults to `visit-dedup`) |

The site is actually served from `https://portfolio.techiemyil.com` (an
Amplify subdomain) — that origin must be in **both** this Lambda's
`ALLOWED_ORIGINS` **and** the API Gateway's own CORS config (`aws apigatewayv2
get-api --api-id fn46m7ogx7`), since API Gateway answers the CORS preflight
itself before the Lambda ever runs. It was missing from both until
2026-08-02, so visit alerts silently never fired for real production
visitors — only requests from `techiemyil.com`/`www` got through.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are already set as real values on the
function. To rotate the bot token later:

```bash
aws lambda update-function-configuration \
  --function-name visit-alert \
  --region ap-south-1 \
  --environment "Variables={TELEGRAM_BOT_TOKEN=<new-token>,TELEGRAM_CHAT_ID=<chat-id>,ALLOWED_ORIGINS=https://techiemyil.com\,https://www.techiemyil.com\,https://portfolio.techiemyil.com\,http://localhost:5173\,http://localhost:4173}"
```

(`update-function-configuration` replaces the whole `Variables` map, so keep
all three keys in the command.)

## Deploying from scratch elsewhere

1. **Create the DynamoDB table**
   ```bash
   aws dynamodb create-table \
     --table-name visit-dedup \
     --attribute-definitions AttributeName=pk,AttributeType=S \
     --key-schema AttributeName=pk,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region <region>
   aws dynamodb wait table-exists --table-name visit-dedup --region <region>
   aws dynamodb update-time-to-live \
     --table-name visit-dedup \
     --time-to-live-specification "Enabled=true,AttributeName=expiresAt" \
     --region <region>
   ```

2. **Create the function**
   - Lambda → Create function → Author from scratch
   - Runtime: Node.js 20.x
   - Upload `index.js` as a .zip (no `node_modules` needed — `@aws-sdk/client-dynamodb`
     ships in the runtime layer)
   - Handler: `index.handler`
   - Attach an execution role with `AWSLambdaBasicExecutionRole` plus an
     inline policy granting `dynamodb:PutItem` on the `visit-dedup` table
     ARN only

3. **Set environment variables**
   - `TELEGRAM_BOT_TOKEN` — the bot token from @BotFather
   - `TELEGRAM_CHAT_ID` — the chat/user ID to send alerts to
   - `ALLOWED_ORIGINS` — comma-separated list of allowed origins, e.g.
     `https://techiemyil.com,https://www.techiemyil.com` (defaults to `*`
     if unset — fine for testing, but restrict it in production so only
     your site can call this endpoint)
   - `VISIT_DEDUP_TABLE` — optional, defaults to `visit-dedup`

4. **Add an API Gateway trigger**
   - Create an HTTP API with a route `POST /visit` → this Lambda (payload
     format 2.0), and enable the API's CORS configuration with the same
     allowed origins (API Gateway then handles the `OPTIONS` preflight
     automatically — no separate `OPTIONS` route needed)
   - Add a resource policy / `lambda add-permission` for
     `apigateway.amazonaws.com` if creating the route manually instead of
     via `aws apigatewayv2 create-api --target ...` (the quick-create path
     does not always attach it automatically — verify with
     `aws lambda get-policy --function-name <name>`)
   - Note the invoke URL, e.g. `https://xxxxxxxxxx.execute-api.<region>.amazonaws.com`

5. **Wire it into the frontend**
   - Set `VITE_VISIT_API_URL` in the site's `.env` to `<invoke-url>/visit`

## Resume download alerts

The resume buttons (hero, header, command palette) open a dialog
([`ResumeDownloadModal`](../../src/components/common/ResumeDownloadModal.tsx))
before the download. It POSTs to `/download` and then opens the resume
regardless of whether the alert succeeded.

Telegram and email are sent independently: the request returns `200` if
either succeeds and `500` only if both fail, so one flaky channel (e.g. SES
sandbox rejecting the recipient) doesn't lose the alert. There is no dedup —
every download is reported.

Extra setup this route needs on top of the visit alert:

1. **IAM** — the execution role (`myva-lambda-role`) needs `ses:SendEmail`
   on the sender identity:
   ```bash
   aws iam put-role-policy --role-name myva-lambda-role --policy-name download-alert-ses \
     --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"ses:SendEmail","Resource":"arn:aws:ses:ap-south-1:905418329604:identity/*"}]}'
   ```
2. **API Gateway** — add `POST /download` to `visit-alert-api` (`fn46m7ogx7`)
   pointing at the same Lambda integration as `POST /visit`. The API's
   existing CORS config already covers it.
   ```bash
   INTEGRATION=$(aws apigatewayv2 get-routes --api-id fn46m7ogx7 --region ap-south-1 \
     --query "Items[?RouteKey=='POST /visit'].Target" --output text)
   aws apigatewayv2 create-route --api-id fn46m7ogx7 --region ap-south-1 \
     --route-key 'POST /download' --target "$INTEGRATION"
   ```
   The Lambda's invoke permission is scoped per route, so a new route also
   needs its own grant — without it API Gateway returns a bare
   `{"message":"Internal Server Error"}` and the Lambda never runs:
   ```bash
   aws lambda add-permission --function-name visit-alert --region ap-south-1 \
     --statement-id apigateway-invoke-download --action lambda:InvokeFunction \
     --principal apigateway.amazonaws.com \
     --source-arn "arn:aws:execute-api:ap-south-1:905418329604:fn46m7ogx7/*/*/download"
   ```
3. **Env vars** (all optional):
   - `DOWNLOAD_EMAIL_FROM` — SES-verified sender, default `support@techiemyil.com`
   - `DOWNLOAD_EMAIL_TO` — recipient, default `support@techiemyil.com`. While
     SES is in sandbox mode this must also be a verified identity.
   - `SES_REGION` — defaults to the Lambda's region
4. **Frontend** — `VITE_DOWNLOAD_API_URL=<invoke-url>/download` in `.env`.

`@aws-sdk/client-ses` ships in the Node 20 runtime, so still no
`node_modules` to bundle.

## Redeploying code after edits

```bash
cd lambda/visit
zip -X visit-lambda.zip index.js
aws lambda update-function-code \
  --function-name <function-name> \
  --zip-file fileb://visit-lambda.zip \
  --region <region>
rm visit-lambda.zip
```

## Request / response shape

```
POST /visit
{ "path": "/at-a-glance", "referrer": "https://google.com" }

200 { "ok": true }
200 { "ok": true, "deduped": true }  # same device already notified today, no Telegram message sent
4xx/5xx { "error": "..." }

POST /download
{ "name": "Jane", "email": "jane@acme.com", "reason": "Recruiter / HR — hiring for a role", "reasonDetail": "" }

200 { "ok": true }
400 { "error": "Name is required." }
500 { "error": "Failed to send download alert." }  # both Telegram and email failed
```

For `/visit` both fields are optional. For `/download` only `name` is required;
an `email` that doesn't look like an address is dropped rather than rejected.
The visitor's IP is read from the API Gateway
request context, not the request body. The "device" for dedup purposes is
`sourceIp + User-Agent`.
