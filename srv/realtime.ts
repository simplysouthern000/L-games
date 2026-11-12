import type { ServerResponse } from 'node:http';

type LiveEvent = { type: string; payload: unknown };
const clients = new Map<string, Set<ServerResponse>>();
const admins = new Set<ServerResponse>();
const KEEPALIVE_MS = 15000;
const PENDING_EVENT_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING_EVENTS = 20;
const pending = new Map<string, Array<{ event: LiveEvent; expiresAt: number }>>();

const write = (response: ServerResponse, event: LiveEvent) => {
	if (response.writableEnded || response.destroyed) return false;
	try {
		response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
		return true;
	} catch {
		return false;
	}
};

const queueForReconnect = (username: string, event: LiveEvent) => {
	const now = Date.now();
	const next = (pending.get(username) ?? []).filter(item => item.expiresAt > now);
	next.push({ event, expiresAt: now + PENDING_EVENT_TTL_MS });
	pending.set(username, next.slice(-MAX_PENDING_EVENTS));
};

const flushPending = (username: string, response: ServerResponse) => {
	const queued = pending.get(username);
	if (!queued) return;
	const now = Date.now();
	for (const item of queued) if (item.expiresAt > now && !write(response, item.event)) break;
	pending.delete(username);
};

export const openClientStream = (username: string, response: ServerResponse) => {
	response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity' });
	response.socket?.setKeepAlive(true, KEEPALIVE_MS);
	response.write('retry: 3000\n: connected\n\n');
	const list = clients.get(username) ?? new Set<ServerResponse>(); list.add(response); clients.set(username, list);
	const close = () => { clearInterval(keepalive); list.delete(response); if (!list.size) clients.delete(username); };
	const keepalive = setInterval(() => { if (!response.writableEnded && !response.destroyed) { try { response.write(': keepalive\n\n'); } catch { close(); } } }, KEEPALIVE_MS);
	response.on('error', close); response.on('close', close);
	flushPending(username, response);
};

export const openAdminStream = (response: ServerResponse) => {
	response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity' });
	response.socket?.setKeepAlive(true, KEEPALIVE_MS);
	response.write('retry: 3000\n: connected\n\n');
	const close = () => { clearInterval(keepalive); admins.delete(response); };
	const keepalive = setInterval(() => { if (!response.writableEnded && !response.destroyed) { try { response.write(': keepalive\n\n'); } catch { close(); } } }, KEEPALIVE_MS);
	admins.add(response); response.on('error', close); response.on('close', close);
};
export const sendToUser = (username: string, type: string, payload: unknown) => {
	const event = { type, payload };
	const list = clients.get(username);
	let delivered = false;
	list?.forEach(response => {
		if (write(response, event)) delivered = true;
	});
	if (!delivered) queueForReconnect(username, event);
};
export const sendToAdmins = (type: string, payload: unknown) => admins.forEach(response => write(response, { type, payload }));
export const sendToAll = (type: string, payload: unknown) => clients.forEach((_, username) => sendToUser(username, type, payload));
