import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { analyticsTagRoute } from './analytics';
import { plusAPI } from './plus';
import {
	authenticate,
	clearSessionCookie,
	isLoginRateLimited,
	getAuthenticatedUsername,
	isAdminRequest,
	isRootAdminRequest,
	listUsers,
	createUser,
	updateUserPassword,
	deleteUser,
	listActiveSessions,
	findSessionById,
	removeSessionsByUsername,
	setUserAdmin,
	touchSession,
	sessionCookie
} from '../auth';
import { openAdminStream, openClientStream, sendToAdmins, sendToAll, sendToUser } from '../realtime';
import { getSiteControls, updateSiteControls } from '../site-controls';

const validUsername = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,32}$/.test(value);
const validPassword = (value: unknown) => typeof value === 'string' && value.length >= 8 && value.length <= 128;
const validHttpUrl = (value: unknown) => {
	if (typeof value !== 'string' || value.length > 2000) return false;
	try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; }
};

async function APIRouter(app: FastifyInstance) {
	app.get('/api/auth/status', async (request, reply) =>
		{
			const username = getAuthenticatedUsername(request.raw);
			return reply.send({
				authenticated: username !== null,
				username,
				isAdmin: isAdminRequest(request.raw),
				isRootAdmin: isRootAdminRequest(request.raw)
			});
		}
	);

	app.post('/api/auth/login', async (request, reply) => {
		if (isLoginRateLimited(request.raw)) {
			return reply.status(429).send({ error: 'Too many attempts. Try again later.' });
		}

		const body = (request.body ?? {}) as {
			username?: unknown;
			password?: unknown;
		};
		const username = typeof body.username === 'string' ? body.username : '';
		const password = typeof body.password === 'string' ? body.password : '';
		const token = authenticate(request.raw, username, password);

		if (!token) {
			return reply.status(401).send({ error: 'Invalid username or password.' });
		}

		return reply.header('Set-Cookie', sessionCookie(token)).send({ ok: true });
	});

	app.post('/api/auth/logout', async (_request, reply) =>
		reply.header('Set-Cookie', clearSessionCookie()).send({ ok: true })
	);

	app.get('/api/events', async (request, reply) => {
		const username = getAuthenticatedUsername(request.raw);
		if (!username) return reply.status(401).send({ error: 'Authentication required.' });
		reply.hijack();
		openClientStream(username, reply.raw);
	});

	app.post('/api/session/activity', async (request, reply) => {
		const body = (request.body ?? {}) as { activity?: unknown; previewUrl?: unknown };
		const previewUrl = typeof body.previewUrl === 'string' && validHttpUrl(body.previewUrl) ? body.previewUrl : '';
		const session = touchSession(request.raw, typeof body.activity === 'string' ? body.activity : undefined, previewUrl);
		if (!session) return reply.status(401).send({ error: 'Authentication required.' });
		sendToAdmins('sessions', listActiveSessions());
		return reply.send({ ok: true });
	});
	app.get('/api/site-controls', async (request, reply) => {
		if (!getAuthenticatedUsername(request.raw)) return reply.status(401).send({ error: 'Authentication required.' });
		return reply.send(getSiteControls());
	});
	app.get('/api/game-html', async (request, reply) => {
		if (!getAuthenticatedUsername(request.raw)) return reply.status(401).send({ error: 'Authentication required.' });
		const query = request.query as { url?: unknown };
		if (typeof query.url !== 'string' || query.url.length > 2000) return reply.status(400).send({ error: 'Invalid game URL.' });
		let target: URL;
		try { target = new URL(query.url); } catch { return reply.status(400).send({ error: 'Invalid game URL.' }); }
		if (target.protocol !== 'https:' || target.hostname !== 'raw.githubusercontent.com' || !/\.html?$/i.test(target.pathname)) return reply.status(400).send({ error: 'Game host is not supported.' });
		try {
			const upstream = await fetch(target.href, { redirect: 'error' });
			if (!upstream.ok) return reply.status(502).send({ error: 'Game document could not be loaded.' });
			const source = await upstream.text();
			if (source.length > 8_000_000) return reply.status(413).send({ error: 'Game document is too large.' });
			const base = `<base href="${target.href.replace(/"/g, '&quot;')}">`;
			const html = /<head\b[^>]*>/i.test(source) ? source.replace(/<head\b[^>]*>/i, match => `${match}${base}`) : `<!doctype html><html><head>${base}</head><body>${source}</body></html>`;
			return reply.header('Content-Type', 'text/html; charset=utf-8').header('Cache-Control', 'private, max-age=300').send(html);
		} catch { return reply.status(502).send({ error: 'Game document could not be loaded.' }); }
	});

	const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
		if (isAdminRequest(request.raw)) return true;
		void reply.status(403).send({ error: 'Administrator access required.' });
		return false;
	};

	app.get('/api/admin/users', async (request, reply) => requireAdmin(request, reply) ? reply.send(listUsers()) : undefined);
	app.post('/api/admin/users', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
		const newUsername = typeof body.username === 'string' ? body.username : '';
		const newPassword = typeof body.password === 'string' ? body.password : '';
		if (!validUsername(newUsername) || !validPassword(newPassword)) return reply.status(400).send({ error: 'Use a 3–32 character username and an 8–128 character password.' });
		if (!createUser(newUsername, newPassword)) return reply.status(409).send({ error: 'That username already exists.' });
		sendToAdmins('users', listUsers());
		return reply.send({ ok: true });
	});
	app.patch('/api/admin/users/:username', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const params = request.params as { username: string };
		const body = (request.body ?? {}) as { password?: unknown };
		const newPassword = typeof body.password === 'string' ? body.password : '';
		if (!validPassword(newPassword)) return reply.status(400).send({ error: 'Password must be 8–128 characters.' });
		if (!updateUserPassword(params.username, newPassword)) return reply.status(404).send({ error: 'User not found.' });
		return reply.send({ ok: true });
	});
	app.patch('/api/admin/users/:username/role', async (request, reply) => {
		if (!isRootAdminRequest(request.raw)) return reply.status(403).send({ error: 'Only the primary administrator can change admin roles.' });
		const params = request.params as { username: string };
		const body = (request.body ?? {}) as { admin?: unknown };
		if (typeof body.admin !== 'boolean') return reply.status(400).send({ error: 'Admin role must be true or false.' });
		if (!setUserAdmin(params.username, body.admin)) return reply.status(404).send({ error: 'User not found.' });
		sendToAdmins('users', listUsers());
		return reply.send({ ok: true });
	});
	app.delete('/api/admin/users/:username', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const params = request.params as { username: string };
		if (!deleteUser(params.username)) return reply.status(400).send({ error: 'The admin account cannot be removed.' });
		sendToAdmins('users', listUsers());
		sendToAdmins('sessions', listActiveSessions());
		return reply.send({ ok: true });
	});
	app.get('/api/admin/sessions', async (request, reply) => requireAdmin(request, reply) ? reply.send(listActiveSessions()) : undefined);
	app.get('/api/admin/events', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		reply.hijack();
		openAdminStream(reply.raw);
		setTimeout(() => sendToAdmins('sessions', listActiveSessions()), 0);
	});
	app.patch('/api/admin/site-controls', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const body = (request.body ?? {}) as Record<string, unknown>;
		const next = Object.fromEntries(Object.entries(body).filter(([key, value]) => ['maintenanceMode', 'gamesDisabled', 'proxyDisabled'].includes(key) && typeof value === 'boolean'));
		return reply.send(updateSiteControls(next));
	});

	app.post('/api/admin/announce', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const body = (request.body ?? {}) as { message?: unknown };
		if (typeof body.message !== 'string' || body.message.trim().length < 1 || body.message.length > 500) return reply.status(400).send({ error: 'Announcement must be 1–500 characters.' });
		sendToAll('banner', { message: body.message.trim() });
		return reply.send({ ok: true });
	});

	const sessionAction = async (request: FastifyRequest, reply: FastifyReply, action: (username: string) => void) => {
		if (!requireAdmin(request, reply)) return;
		const params = request.params as { id: string };
		const found = findSessionById(params.id);
		if (!found) return reply.status(404).send({ error: 'Session is no longer active.' });
		action(found[1].username);
		sendToAdmins('sessions', listActiveSessions());
		return reply.send({ ok: true });
	};
	app.post('/api/admin/sessions/:id/message', async (request, reply) => sessionAction(request, reply, username => {
		const body = (request.body ?? {}) as { message?: unknown };
		if (typeof body.message === 'string' && body.message.trim()) sendToUser(username, 'banner', { message: body.message.trim().slice(0, 500) });
	}));
	app.post('/api/admin/sessions/:id/redirect', async (request, reply) => {
		const body = (request.body ?? {}) as { url?: unknown };
		if (!validHttpUrl(body.url)) return reply.status(400).send({ error: 'Enter a valid http or https URL.' });
		return sessionAction(request, reply, username => sendToUser(username, 'redirect', { url: body.url }));
	});
	app.post('/api/admin/sessions/:id/kick', async (request, reply) => sessionAction(request, reply, username => sendToUser(username, 'kick', {})));
	app.post('/api/admin/sessions/:id/signout', async (request, reply) => sessionAction(request, reply, username => {
		sendToUser(username, 'signout', {});
		removeSessionsByUsername(username);
	}));
	app.post('/api/admin/sessions/:id/jumpscare', async (request, reply) => {
		if (!requireAdmin(request, reply)) return;
		const body = (request.body ?? {}) as { imageUrl?: unknown };
		if (!validHttpUrl(body.imageUrl)) return reply.status(400).send({ error: 'Enter a valid image URL.' });
		return sessionAction(request, reply, username => sendToUser(username, 'jumpscare', { imageUrl: body.imageUrl, duration: 10000 }));
	});

	// Server only route that the frontend can reference for detection of static shit
	app.get(
		'/api/detect',
		async (_request: FastifyRequest, reply: FastifyReply) => {
			return reply
				.status(200)
				.header('Content-Type', 'application/json')
				.header('Cache-Control', 'no-cache, no-store, must-revalidate')
				.send({ server: true });
		}
	);

	app.post('/api/report', async (request, reply) => {
		const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
		const body = (request.body ?? {}) as {
			kind?: unknown;
			message?: unknown;
			page?: unknown;
		};

		if (typeof body.message !== 'string' || body.message.trim().length < 3) {
			return reply.status(400).send({
				error: 'Please enter at least 3 characters.'
			});
		}

		if (body.message.length > 2000) {
			return reply.status(400).send({
				error: 'Feedback must be 2000 characters or fewer.'
			});
		}

		if (!webhookUrl) {
			return reply.status(503).send({
				error: 'Feedback reporting is not configured.'
			});
		}

		const kind =
			body.kind === 'suggestion'
				? 'Suggestion'
				: 'Bug report';
		const page = typeof body.page === 'string' ? body.page.slice(0, 200) : 'Unknown';
		const content = [
			`**${kind}**`,
			body.message.trim(),
			'',
			`Page: ${page}`
		].join('\n');

		try {
			const response = await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					content,
					username: 'Space Feedback',
					allowed_mentions: { parse: [] }
				})
			});

			if (!response.ok) {
				return reply.status(502).send({
					error: 'Discord rejected the feedback.'
				});
			}

			return reply.send({ ok: true });
		} catch {
			return reply.status(502).send({
				error: 'Could not reach Discord.'
			});
		}
	});

	plusAPI(app);
	analyticsTagRoute(app);
}

export { APIRouter };
export default APIRouter;
