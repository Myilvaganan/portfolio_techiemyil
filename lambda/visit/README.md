# Visit Alert Lambda

Sends a Telegram message to the site owner whenever a visitor loads
techiemyil.com — once per unique browser per day (deduped client-side in
[`src/lib/visit.ts`](../../src/lib/visit.ts), so refreshes and route changes
within the same day don't spam Telegram).

No dependencies required: uses Node's built-in `fetch`, available in the
Lambda Node.js 18.x and 20.x runtimes.

## Currently deployed

This is already live in AWS account `905418329604` (ap-south-1):

| Resource | Name / ID |
|---|---|
| Lambda function | `visit-alert` |
| IAM execution role | `myva-lambda-role` (shared with the MYVA lambda — AWSLambdaBasicExecutionRole only) |
| API Gateway (HTTP API) | `visit-alert-api` (`fn46m7ogx7`) |
| Invoke URL | `https://fn46m7ogx7.execute-api.ap-south-1.amazonaws.com/visit` |
| `ALLOWED_ORIGINS` | `https://techiemyil.com,https://www.techiemyil.com,http://localhost:5173,http://localhost:4173` |

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are already set as real values on the
function. To rotate the bot token later:

```bash
aws lambda update-function-configuration \
  --function-name visit-alert \
  --region ap-south-1 \
  --environment "Variables={TELEGRAM_BOT_TOKEN=<new-token>,TELEGRAM_CHAT_ID=<chat-id>,ALLOWED_ORIGINS=https://techiemyil.com\,https://www.techiemyil.com\,http://localhost:5173\,http://localhost:4173}"
```

(`update-function-configuration` replaces the whole `Variables` map, so keep
all three keys in the command.)

## Deploying from scratch elsewhere

1. **Create the function**
   - Lambda → Create function → Author from scratch
   - Runtime: Node.js 20.x
   - Upload `index.js` as a .zip (no `node_modules` needed)
   - Handler: `index.handler`

2. **Set environment variables**
   - `TELEGRAM_BOT_TOKEN` — the bot token from @BotFather
   - `TELEGRAM_CHAT_ID` — the chat/user ID to send alerts to
   - `ALLOWED_ORIGINS` — comma-separated list of allowed origins, e.g.
     `https://techiemyil.com,https://www.techiemyil.com` (defaults to `*`
     if unset — fine for testing, but restrict it in production so only
     your site can call this endpoint)

3. **Add an API Gateway trigger**
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

4. **Wire it into the frontend**
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
4xx/5xx { "error": "..." }
```

Both fields are optional. The visitor's IP is read from the API Gateway
request context, not the request body.
