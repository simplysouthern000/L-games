import type { ServerResponse } from 'node:http';

type LiveEvent = { type: string; payload: unknown };
const clients = new Map<string, Set<ServerResponse>>();
const admins = new Set<ServerResponse>();
const KEEPALIVE_MS = 15000;

const write = (response: ServerResponse, event: LiveEvent) => {
	if (!response.writableEnded) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
};

export const openClientStream = (username: string, response: ServerResponse) => {
	response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity' });
	response.write('retry: 3000\n: connected\n\n');
	const keepalive = setInterval(() => { if (!response.writableEnded) response.write(': keepalive\n\n'); }, KEEPALIVE_MS);
	const list = clients.get(username) ?? new Set<ServerResponse>(); list.add(response); clients.set(username, list);
	response.on('close', () => { clearInterval(keepalive); list.delete(response); if (!list.size) clients.delete(username); });
};

export const openAdminStream = (response: ServerResponse) => {
	response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity' });
	response.write('retry: 3000\n: connected\n\n');
	const keepalive = setInterval(() => { if (!response.writableEnded) response.write(': keepalive\n\n'); }, KEEPALIVE_MS);
	admins.add(response); response.on('close', () => { clearInterval(keepalive); admins.delete(response); });
};
export const sendToUser = (username: string, type: string, payload: unknown) => clients.get(username)?.forEach(response => write(response, { type, payload }));
export const sendToAdmins = (type: string, payload: unknown) => admins.forEach(response => write(response, { type, payload }));
export const sendToAll = (type: string, payload: unknown) => clients.forEach((_, username) => sendToUser(username, type, payload));
