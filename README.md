# send-notification

A Cloudflare Worker that other services call when something happens, such as a server error. It always notifies the same person. Email is the first delivery method, sent through the Resend HTTP API. The Worker answers as soon as the request is valid and sends the email in the background.

Other methods, such as Telegram, can be added later. Callers choose one with `method`. An empty `method` means email.

## Request

`POST https://send-notification.szb.workers.dev`

```json
{
  "secretKey": "...",
  "subject": "Server error",
  "text": "Worker X crashed",
  "method": "email"
}
```

`method` may be omitted, `""`, or `"email"`.

A valid request returns `{"ok": true, "method": "email"}` before Resend responds.

## Environment

`RESEND_API_KEY`, `SECRET_KEY`, `NOTIFY_TO`, and `NOTIFY_FROM` are Worker secrets. Copy `.dev.vars.example` to `.dev.vars` for local development.
