import type { FastifyInstance } from 'fastify';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { APIRouter } from './api';
import { cacheControl } from './vite/assert-artifacts';
import { isAuthenticatedRequest, publicAuthPath } from './auth';

const __dirname = process.cwd();

const frontendPath = path.join(__dirname, 'dist');

async function router(fastify: FastifyInstance) {
	fastify.addHook('onRequest', async (request, reply) => {
		const url = request.raw.url ?? '/';
		const pathname = url.split('?')[0];
		const protectedEntry =
			pathname === '/space' ||
			(pathname === '/' && new URL(url, 'http://localhost').searchParams.get('redirect') === '1');

		// The public landing shell and its static assets remain accessible.
		if (!protectedEntry && !pathname.startsWith('/api/')) return;
		if (publicAuthPath(url) || isAuthenticatedRequest(request.raw)) return;

		if (url.split('?')[0].startsWith('/api/')) {
			return reply.status(401).send({ error: 'Authentication required.' });
		}

		return reply.redirect('/login.html');
	});

	await fastify.register(fastifyStatic, {
		root: frontendPath,
		prefix: '/',
		index: ['index.html'],
		extensions: ['html'],
		cacheControl: false,
		setHeaders: (res, filePath) => {
			res.setHeader('Cache-Control', cacheControl(path.relative(frontendPath, filePath)));
		}
	});
	fastify.get('/space', async (_request, reply) => reply.sendFile('index.html'));

	await APIRouter(fastify);
}

export { router };
export default router;
