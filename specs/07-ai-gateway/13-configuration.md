# 13 — Configure the Generic AI Gateway

[Index](README.md) · prev: [12 Client wire](12-client-wire.md)

The provider is in the Databricks app. OpenGenie calls it XAIA. The product name
in the picker is **Generic AI Gateway**. Serving endpoints stay on
`POST {workspace}/serving-endpoints/{name}/chat/completions` with
`Authorization: Bearer` and `DATABRICKS_TOKEN`. This provider is a second host.

## Steps

1. Pick one environment from the table below. Paste that URL. The path on the
   host contains `/gaia`. That is the deployed path. Changing it to `/xaia`
   misses the gateway.
2. Create a Databricks secret named `gateway-api-key` in the app's secret scope.
   The value is the subscription key. It must be at least 20 characters and must
   not contain a space. Do not paste the key into `app.yaml` or into git.
3. In `apps/coding-agent/app.yaml`, or in the app's environment in the workspace,
   set the three entries below. `APP_LLM_ALLOW_EXTERNAL` is already `true` in
   this repository's `app.yaml`.
4. Redeploy the app (`make -C apps/coding-agent deploy`, or the workspace app
   deploy). Settings are read at process start.
5. Open the model picker. The group **Generic AI Gateway** is second, after
   Databricks · AI Gateway. The tag is `catalog`. Select a chat row and send a
   turn. The first request is the check that the key and the base URL work.

```yaml
- name: APP_LLM_ALLOW_EXTERNAL
  value: "true"
- name: APP_LLM_GATEWAY_BASE_URL
  value: "https://apim-genaigw.lpl-cloud.com/oat/gaia"
- name: LLM_GATEWAY_KEY
  valueFrom: gateway-api-key
```

`APP_LLM_GATEWAY_BASE_URL` ships as an empty string so a deploy does not pin an
environment. Fill it for the environment you mean to call. Until it is filled,
and `XAIA_BASE_URL` is also empty, the app does not call the gateway.

To try it on a laptop before that deploy:

```bash
cd apps/coding-agent
export APP_LLM_ALLOW_EXTERNAL=true
export APP_LLM_GATEWAY_BASE_URL='https://apim-genaigw.lpl-cloud.com/oat/gaia'
export LLM_GATEWAY_KEY='…subscription key…'
make dev-real
```

Keep the key in the shell environment. Do not write it into a file in this
repository.

## Names the app reads

| Variable | Who reads it | Value |
|---|---|---|
| `APP_LLM_ALLOW_EXTERNAL` | The catalogue | `true`. The app default is false. While it is false the rows stay visible and cannot be selected |
| `APP_LLM_GATEWAY_BASE_URL` | Settings (`APP_` prefix) | The gateway root, `https`, no trailing slash. Empty means the app does not call the gateway |
| `XAIA_BASE_URL` | The same resolver, only when the setting above is empty | Same URL. No `APP_` prefix |
| `LLM_GATEWAY_KEY` | The env vault | The subscription key. Sent as the header `api-key`. No `APP_` prefix |
| `XAIA_API_KEY` | The env vault, only when `LLM_GATEWAY_KEY` is empty | The same key. No `APP_` prefix |
| `APP_LLM_GATEWAY_API_VERSION` | The query string | Optional. Default `2024-08-01-preview` |

`APP_LLM_GATEWAY_KEY` is not read. A key saved on the settings screen (once a
key-encryption key is configured) wins over the environment for that user.

The child process receives the key as `LLM_PROVIDER_KEY`. The agent file
references `{env:LLM_PROVIDER_KEY}`. Do not put `DATABRICKS_TOKEN` in `api-key`.

## Bases

The client resolves UAT, OAT, then production. OpenGenie does not. Pick the
environment in the variable. These are the shapes the client uses:

| Environment | Base |
|---|---|
| UAT | `https://int-apim-genaigw.lpl-cloud.com/uat/gaia` |
| OAT | `https://apim-genaigw.lpl-cloud.com/oat/gaia` |
| Production | `https://apim-genaigw.lpl-cloud.com/gaia` |

An `http://` base is refused before any request. An empty base is a
configuration error, and the app leaves the host unset.

A direct check, before the app, is:

```http
GET {base}/deployments?api-version=2024-08-01-preview
api-key: <subscription key>
```

A readable answer is `{"models":[...]}`. The app does not call `GET /openai/models`.

## What appears in the picker

Five rows, group **Generic AI Gateway**, second in the list. The tag is `catalog`.

| Row | Deployment | Wire |
|---|---|---|
| GPT 5.6 Sol | `gpt-5.6-sol` | OpenAI-shaped, reasoning, no temperature |
| Terra | `gpt-5.6-terra` | OpenAI-shaped |
| Luna | `gpt-5.6-luna` | OpenAI-shaped |
| Claude Sonnet 5 | `claude-sonnet-5` | `POST {base}/anthropic/v1/messages` |
| text-embedding-3-large | `text-embedding-3-large` | Embeddings. Not a chat choice |

`gpt-5.5` is not seeded. The door answers 405 for that deployment.
The product default stays `google_vertex/google/gemini-3.8-flash`.

A row is selectable when external providers are on and a key is present.
`GET {base}/deployments` can add further deployments. A configured row wins
over the list on the same name. A denial leaves the rows above in place.

## What the app sends

OpenAI-shaped chat:

```http
POST {base}/openai/deployments/{deployment}/chat/completions?api-version=2024-08-01-preview
api-key: <subscription key>

{"messages": [...], "max_completion_tokens": 8192}
```

The deployment name is in the path. The body has no `model` field.
Temperature is omitted for `gpt-5.6-sol` and for Claude.

## When it does not come up

| What you see | What to change |
|---|---|
| The group is missing | Redeploy after the seed that contains provider `gateway`. An existing database inserts new provider and model ids and does not overwrite a row you already edited |
| Rows are visible and cannot be selected | Set `APP_LLM_ALLOW_EXTERNAL` to `true` and restart |
| "Generic AI Gateway has no base URL" | Set `APP_LLM_GATEWAY_BASE_URL`, or `XAIA_BASE_URL` if that setting is empty |
| "The gateway base URL must be https" | Replace an `http://` base. The app does not send the request |
| "Generic AI Gateway needs a key" | Set `LLM_GATEWAY_KEY` or `XAIA_API_KEY`. `APP_LLM_GATEWAY_KEY` is ignored |
| "This key cannot call {deployment}" | The key is accepted and that deployment is not. The HTTP status was 405 |
| "The gateway is paused after repeated failures" | Five exhausted calls opened the circuit. Wait a minute. 400, 401, 403, and 405 do not open it |
| Serving models disappear or change host | They should not. A refresh of `/api/2.0/serving-endpoints` does not mark a `gateway/` row as not served |

## Keys that must not be copied

`config/agent.yaml` and `src/agents/config.py` in the 17 Nov 2026 client tree
contain live subscription keys, and that client falls back to them when the
environment is empty. OpenGenie does not read those files and does not embed
those values. Rotate the keys that were stored there. The only sources
OpenGenie accepts are the environment variables above or a key saved in the vault.

## Serving stays where it is

`DatabricksAdapter`, discovery of `/api/2.0/serving-endpoints`, and the serving
agent file compared in `tests/test_llm_agent_config.py`
(`tests/fixtures/opencode.agent014.golden.json`) are unchanged.
