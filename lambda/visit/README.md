# Visit Alert Lambda

Sends a Telegram message to the site owner whenever a visitor loads
techiemyil.com — once per device per day. Deduped two ways:

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
```

Both fields are optional. The visitor's IP is read from the API Gateway
request context, not the request body. The "device" for dedup purposes is
`sourceIp + User-Agent`.
