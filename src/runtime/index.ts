import { discoverProxyContext } from '../bridge/client';
import type { Proxy } from '../utils/proxy';
import { resolveNavigation } from './navigation';
import { assetUrl } from './asset-url';

export interface SpaceRuntime {
	readonly mode: 'standalone' | 'delegated' | 'unavailable';
	ready: Promise<void>;
	readonly error?: string;
	navigate(
		iframe: HTMLIFrameElement,
		input: string,
		current?: () => boolean
	): Promise<void>;
	fetch(url: string, init?: RequestInit): Promise<string>;
	/** Standalone image routing is provided by a real registered local frame. */
	imageUrl?(url: string): string;
	dispose(): void;
	/** Local controls are absent in delegated mode, never synthetic transports. */
	local?: Pick<
		Proxy,
		'proxySetting' | 'transportVar' | 'setTransports' | 'scramConfig'
	>;
}

export async function createStandaloneRuntime(
	prepareScripts: () => Promise<void>
): Promise<SpaceRuntime> {
	await prepareScripts();
	const { Proxy } = await import('../utils/proxy');
	const proxy = new Proxy();
	try {
		await proxy.ready;
		const config = proxy.config.sj;
		if (typeof config?.func === 'function') await config.func();
	} catch (error) {
		proxy.dispose();
		throw error;
	}
	return {
		mode: 'standalone',
		ready: Promise.resolve(),
		local: proxy,
		navigate: (iframe, url, current) =>
			proxy.navigate(iframe, url, current),
		fetch: (url, init) => proxy.fetch(url, init),
		imageUrl: url => proxy.imageUrl(url),
		dispose: () => proxy.dispose()
	};
}

export async function selectRuntime(
	win: Window,
	makeStandalone: () => Promise<SpaceRuntime>
): Promise<SpaceRuntime> {
	const session = await discoverProxyContext(win);
	let lost = false;
	let disposed = false;
	let local: SpaceRuntime | undefined;
	let startupError: string | undefined;
	const generations = new WeakMap<HTMLIFrameElement, number>();
	const unavailable = () =>
		new Error('Proxy context is unavailable; reload to reconnect');
	const check = async () => {
		if (lost || disposed) throw unavailable();
		try {
			await session!.assertReady();
		} catch {
			lost = true;
			throw unavailable();
		}
		if (lost || disposed) throw unavailable();
	};
	if (!session) {
		try {
			local = await makeStandalone();
		} catch (error) {
			lost = true;
			startupError =
				error instanceof Error
					? error.message
					: 'Local proxy startup failed';
		}
	}
	const runtime: SpaceRuntime = {
		error: startupError,
		get mode() {
			return lost || disposed
				? 'unavailable'
				: session
					? 'delegated'
					: 'standalone';
		},
		ready: Promise.resolve(),
		local: local?.local,
		imageUrl(url) {
			if (session || lost || disposed || !local) return '';
			return local.imageUrl?.(url) ?? '';
		},
		async navigate(iframe, input) {
			const generation = (generations.get(iframe) ?? 0) + 1;
			generations.set(iframe, generation);
			const current = () =>
				generations.get(iframe) === generation && !disposed;
			const target = resolveNavigation(input, win.location.origin);
			if (target.kind === 'internal') {
				iframe.src = assetUrl(target.url, win.location.href);
				return;
			}
			const targetUrl = new URL(target.url, win.location.origin);
			if (targetUrl.origin === win.location.origin && targetUrl.pathname === '/api/game-html') {
				iframe.src = targetUrl.href;
				return;
			}
			if (session) {
				await check();
				if (!current()) return;
				win.location.href = target.url;
			} else {
				if (lost || disposed || !local) throw unavailable();
				await local.ready;
				if (!current()) return;
				await local.navigate(iframe, target.url, current);
			}
		},
		async fetch(url, init) {
			const target = resolveNavigation(url, win.location.origin);
			if (session) {
				await check();
				const response = await win.fetch(target.url, init);
				if (!response.ok) throw new Error('Document fetch failed');
				return response.text();
			}
			if (lost || disposed || !local) throw unavailable();
			await local.ready;
			return local.fetch(target.url, init);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			session?.dispose();
			local?.dispose();
			win.removeEventListener('pagehide', runtime.dispose);
		}
	};
	win.addEventListener('pagehide', runtime.dispose);
	return runtime;
}
