export interface Env {
	SECRET_KEY: string;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

type Notification = {
	subject: string;
	text: string;
};

const requiredEnv = ['SECRET_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const;

export default {
	async fetch(request, env, ctx): Promise<Response> {
		if (request.method !== 'POST') {
			return json({ error: 'Method not allowed' }, 405);
		}

		const missing = requiredEnv.filter((key) => !env[key]);
		if (missing.length) {
			console.error('Missing environment variables', missing.join(', '));
			return json({ error: 'Server is missing configuration' }, 500);
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Invalid JSON' }, 400);
		}

		if (!isAuthorized(body, env.SECRET_KEY)) {
			return json({ error: 'Unauthorized' }, 401);
		}

		const parsed = parseNotification(body);
		if (!parsed.ok) return json({ error: parsed.error }, 400);

		const notification = parsed.value;
		ctx.waitUntil(
			sendTelegram(notification, env).then(
				(id) => console.log('Sent notification', id),
				(error) => console.error('Failed to send notification', error),
			),
		);
		return json({ ok: true });
	},
} satisfies ExportedHandler<Env>;

function parseNotification(body: unknown): { ok: true; value: Notification } | { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'Body must be a JSON object' };
	}

	const record = body as Record<string, unknown>;
	const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
	const text = typeof record.text === 'string' ? record.text.trim() : '';

	if (!subject) return { ok: false, error: 'subject is required' };
	if (subject.length > 200) return { ok: false, error: 'subject must be 200 characters or fewer' };
	if (!text) return { ok: false, error: 'text is required' };
	if (text.length > 100_000) return { ok: false, error: 'text must be 100000 characters or fewer' };

	return { ok: true, value: { subject, text } };
}

async function sendTelegram(notification: Notification, env: Env): Promise<string> {
	const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			chat_id: env.TELEGRAM_CHAT_ID,
			parse_mode: 'HTML',
			text: telegramText(notification),
		}),
	});

	const payload = (await response.json().catch(() => null)) as {
		ok?: boolean;
		description?: string;
		result?: { message_id?: number };
	} | null;
	if (!response.ok || !payload?.ok || payload.result?.message_id == null) {
		throw new Error(`Telegram returned ${response.status}: ${payload?.description ?? response.statusText}`);
	}

	return String(payload.result.message_id);
}

function telegramText(notification: Notification): string {
	const header = `<b>${escapeHtml(notification.subject)}</b>\n\n`;
	const text = escapeHtml(notification.text).slice(0, Math.max(0, 4096 - header.length));
	return `${header}${text}`;
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function isAuthorized(body: unknown, secretKey: string): boolean {
	if (!body || typeof body !== 'object') return false;
	const provided = (body as Record<string, unknown>).secretKey;
	if (typeof provided !== 'string' || !provided) return false;
	return timingSafeEqual(provided, secretKey);
}

function timingSafeEqual(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) return false;
	return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}
