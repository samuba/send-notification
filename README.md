# send-notification

A Cloudflare Worker that other services call when something happens, such as a server error. It always notifies the same person on Telegram, through the Bot API. The caller does not choose how the notification is delivered. The Worker answers as soon as the request is valid and sends the message in the background.

## Request

`POST https://send-notification.szb.workers.dev`

```json
{
  "secretKey": "...",
  "subject": "Server error",
  "text": "Worker X crashed"
}
```

A valid request returns `{"ok": true}` before Telegram responds. The subject is sent in bold.

## Environment

`SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID` are Worker secrets. Copy `.dev.vars.example` to `.dev.vars` for local development.
