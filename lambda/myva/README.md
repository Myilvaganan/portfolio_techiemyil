# MYVA Lambda

Backend for **MYVA**, the AI chat assistant on the portfolio site. It answers
visitor questions using *only* the content in [`knowledge.js`](./knowledge.js)
— a hand-compiled snapshot of `src/data/*.ts` on the frontend — and calls the
OpenAI Chat Completions API to generate replies.

No dependencies are required: it uses Node's built-in `fetch`, available in
the Lambda Node.js 18.x and 20.x runtimes.

## Currently deployed

This is already live in AWS account `905418329604` (ap-south-1):

| Resource | Name / ID |
|---|---|
| Lambda function | `myva-chatbot` |
| IAM execution role | `myva-lambda-role` (AWSLambdaBasicExecutionRole only — logs access, nothing else) |
| API Gateway (HTTP API) | `myva-chatbot-api` (`qo27vb65j6`) |
| Invoke URL | `https://qo27vb65j6.execute-api.ap-south-1.amazonaws.com/myva` |
| `ALLOWED_ORIGINS` | `https://techiemyil.com,https://www.techiemyil.com` |

**`OPENAI_API_KEY` is currently set to the placeholder `REPLACE_ME`** — the
function returns a graceful 500 until you set a real key:

```bash
aws lambda update-function-configuration \
  --function-name myva-chatbot \
  --region ap-south-1 \
  --environment "Variables={OPENAI_API_KEY=sk-...,OPENAI_MODEL=gpt-4o-mini,ALLOWED_ORIGINS=https://techiemyil.com\,https://www.techiemyil.com}"
```

(`update-function-configuration` replaces the whole `Variables` map, so keep
all three keys in the command — don't drop `OPENAI_MODEL`/`ALLOWED_ORIGINS`.)

To redeploy the code after editing `index.js` or `knowledge.js`:

```bash
cd lambda/myva
zip -X myva-lambda.zip index.js knowledge.js
aws lambda update-function-code \
  --function-name myva-chatbot \
  --zip-file fileb://myva-lambda.zip \
  --region ap-south-1
rm myva-lambda.zip
```

## Deploying from scratch elsewhere (AWS Console, HTTP API)

1. **Create the function**
   - Lambda → Create function → Author from scratch
   - Runtime: Node.js 20.x
   - Upload `index.js` and `knowledge.js` as a .zip (no `node_modules` needed)
   - Handler: `index.handler`

2. **Set environment variables**
   - `OPENAI_API_KEY` — your OpenAI API key (required)
   - `OPENAI_MODEL` — optional, defaults to `gpt-4o-mini`
   - `ALLOWED_ORIGINS` — comma-separated list of allowed origins, e.g.
     `https://techiemyil.com,https://www.techiemyil.com` (defaults to `*`
     if unset — fine for testing, but restrict it in production so only
     your site can call this endpoint)

3. **Add an API Gateway trigger**
   - Create an HTTP API with a route `POST /myva` → this Lambda (payload
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
   - Set `VITE_MYVA_API_URL` in the site's `.env` to `<invoke-url>/myva`

## Keeping answers accurate

`knowledge.js` is a static string, not generated from `src/data/*.ts`. When
resume content changes (new role, new project, updated skills, etc.), update
this file to match — otherwise MYVA will answer with stale information.

## Request / response shape

```
POST /myva
{ "message": "What cloud platforms does Myil use?", "history": [{ "role": "user" | "assistant", "content": "..." }] }

200 { "reply": "..." }
4xx/5xx { "error": "..." }
```

`history` is optional and capped server-side to the last 8 messages.
