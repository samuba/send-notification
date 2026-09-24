export interface Env {
	RESEND_API_KEY: string;
	SECRET_KEY: string;
	NOTIFY_TO: string;
	NOTIFY_FROM: string;
}

type NotificationMethod = 'email';

type Notification = {
	subject: string;
	text: string;
	method: NotificationMethod;
};

const requiredEnv = ['RESEND_API_KEY', 'SECRET_KEY', 'NOTIFY_TO', 'NOTIFY_FROM'] as const;

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
			sendNotification(notification, env).then(
				(id) => console.log('Sent notification', notification.method, id),
				(error) => console.error('Failed to send notification', error),
			),
		);
		return json({ ok: true, method: notification.method });
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

	const method = record.method;
	if (method !== undefined && method !== null && method !== '' && method !== 'email') {
		return { ok: false, error: 'method must be empty or "email"' };
	}

	return { ok: true, value: { subject, text, method: 'email' } };
}

async function sendNotification(notification: Notification, env: Env): Promise<string> {
	switch (notification.method) {
		case 'email':
			return sendEmail(notification, env);
	}
}

async function sendEmail(notification: Notification, env: Env): Promise<string> {
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: env.NOTIFY_FROM,
			to: [env.NOTIFY_TO],
			subject: notification.subject,
			text: notification.text,
		}),
	});

	const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
	if (!response.ok || !payload?.id) {
		throw new Error(`Resend returned ${response.status}: ${payload?.message ?? response.statusText}`);
	}

	return payload.id;
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
