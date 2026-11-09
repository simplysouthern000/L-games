import http, { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { constants as zlibConstants } from 'node:zlib';
import fastifyCompress from '@fastify/compress';
import fastifyHelmet from '@fastify/helmet';
// @ts-ignore
import { server as wisp, logging } from '@mercuryworkshop/wisp-js/server';
import chalk from 'chalk';
import Fastify from 'fastify';
import gradient from 'gradient-string';
import { version } from './package.json';
import { getPlatform } from './srv/platform';
import routes from './srv/router';
import { isAuthenticatedRequest } from './srv/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logoText = readFileSync(
	join(__dirname, 'srv', 'startup', 'logo.txt'),
	'utf-8'
);
const nameText = readFileSync(
	join(__dirname, 'srv', 'startup', 'name.txt'),
	'utf-8'
);

const server = Fastify({
	logger: false,
	routerOptions: {
		ignoreDuplicateSlashes: true,
		ignoreTrailingSlash: true
	},
	serverFactory: handler => {
		const srv = http.createServer();
		logging.set_level(logging.ERROR);
		wisp.options.dns_method = 'resolve';
		wisp.options.dns_servers = ['1.1.1.1', '1.0.0.1'];
		wisp.options.dns_result_order = 'ipv4first';
		wisp.options.wisp_version = 2;
		wisp.options.wisp_motd = 'WISP server';
		srv.on('request', (req, res) => {
			handler(req, res);
		});
		srv.on('upgrade', (req, socket, head) => {
			if (!isAuthenticatedRequest(req)) {
				socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
				socket.destroy();
				return;
			}
			let pathname = '';
			try {
				pathname = new URL(req.url || '/', 'http://space.internal').pathname;
			} catch {
				pathname = '';
			}
			if (pathname === '/w/' || pathname === '/w') {
				wisp.routeRequest(req, socket as any, head);
			} else {
				socket.destroy();
			}
		});
		return srv;
	}
});

await server.register(fastifyCompress, {
	encodings: ['br', 'gzip', 'deflate'],
	brotliOptions: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } },
	zlibOptions: { level: 6 }
});

await server.register(fastifyHelmet, {
	xPoweredBy: false,
	crossOriginEmbedderPolicy: { policy: 'credentialless' }, //used to be true, but that breaks images sometimes
	crossOriginOpenerPolicy: true,
	contentSecurityPolicy: false
});

server.register(routes);

const PORT: number = Number(process.env.PORT) || 6060;
const HOST: string = process.env.HOST || '127.0.0.1';

try {
	await server.listen({ port: PORT, host: HOST });
	const serverInstance = server.server as Server;
	const address = serverInstance.address() as AddressInfo;
	const theme = chalk.hex('#630aba').bold;
	const ddx = {
		1: '#8b0ab8',
		2: '#630aba',
		3: '#665e72',
		4: '#1c1724'
	};
	const host = chalk.hex('#4a4c7f').bold;

	const logoLines = logoText.split('\n');
	const nameLines = nameText.split('\n');
	const maxLines = Math.max(logoLines.length, nameLines.length);
	const logoWidth = Math.max(...logoLines.map(line => line.length));

	const combined = [];
	for (let i = 0; i < maxLines; i++) {
		const logoLine = (logoLines[i] || '').padEnd(logoWidth, ' ');
		const nameLine = nameLines[i] || '';
		combined.push(logoLine + '  ' + nameLine);
	}

	console.log(
		gradient(Object.values(ddx)).multiline('\n' + combined.join('\n'))
	);

	console.log(theme('Version: '), chalk.whiteBright('v' + version));
	const platformUrl = getPlatform(PORT);
	const deploymentMethod = platformUrl ? 'Platform' : 'Self-Hosted';
	console.log(
		theme('🌐 Deployment Method: '),
		chalk.whiteBright(deploymentMethod)
	);
	console.log(host('🔗 Deployment Entrypoints: '));
	console.log(
		`  ${chalk.bold(host('Local System IPv4:'))}            http://${address.address}:${PORT}`
	);

	if (platformUrl)
		console.log(
			`  ${chalk.bold(host('Platform:'))}                     ${platformUrl}`
		);

	if (HOST === '0.0.0.0') {
		console.log(
			'\n' +
				chalk.yellow.bold(
					'⚠️  WARNING: Server is listening on 0.0.0.0 (all network interfaces)'
				) +
				'\n' +
				chalk.yellow(
					'   This means the server is accessible from other machines on your network.'
				) +
				'\n' +
				chalk.yellow(
					'   For production deployments, ensure you have:'
				) +
				'\n' +
				chalk.yellow(
					'   • A reverse proxy (nginx, Caddy, etc.) configured'
				) +
				'\n' +
				chalk.yellow('   • HTTPS enabled with valid certificates') +
				'\n' +
				chalk.yellow('   • Firewall rules to restrict access') +
				'\n' +
				chalk.yellow(
					"   For local development, consider using host: '127.0.0.1' in config.js"
				) +
				'\n'
		);
	} else if (HOST === '127.0.0.1' || HOST === 'localhost') {
		console.log(
			'\n' +
				chalk.green('✅ Server is running in local mode (127.0.0.1)') +
				'\n' +
				chalk.green(
					'   Only accessible from this machine - safe for development.'
				) +
				'\n'
		);
	}
} catch (error) {
	server.log.error(error);
	process.exit(1);
}
