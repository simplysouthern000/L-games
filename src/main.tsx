import { Suspense, lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Loading } from './components/Loading.tsx';
import indexStyles from './index.css?inline';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { launchAboutBlank, launchBlob, applyCloak } from './lib/cloak.ts';
import { readSetting, initSettings } from './hooks/useLocalStorage';
import {
	createStandaloneRuntime,
	selectRuntime,
	type SpaceRuntime
} from './runtime';
import { initialView } from './runtime/entry-view';
import { installFontRuntime } from '../srv/vite/font/runtime';
import { reportSvgReady } from './runtime/svg-ready';
import { shadowMode as getShadowMode } from './runtime/shadow-mode';
import { assetUrl } from './runtime/asset-url';

function SvgReady() {
	useEffect(() => {
		reportSvgReady(window);
	}, []);
	return null;
}

const GamesPage = lazy(() =>
	import('./pages/GamesPage.tsx').then(m => ({ default: m.GamesPage }))
);
const SettingsPage = lazy(() =>
	import('./pages/SettingsPage.tsx').then(m => ({ default: m.SettingsPage }))
);
const AdminPage = lazy(() =>
	import('./pages/AdminPage.tsx').then(m => ({ default: m.AdminPage }))
);
const PlaybackPage = lazy(() =>
	import('./pages/PlaybackPage.tsx').then(m => ({ default: m.PlaybackPage }))
);

const boot = async () => {
	const params = new URLSearchParams(window.location.search);
	const protectedEntry = window.location.pathname === '/space' || params.get('redirect') === '1';
	if (window === window.top && !protectedEntry) {
		window.setTimeout(() => {
			if (window.location.pathname === '/' && !window.location.search) {
				window.location.assign('/space');
			}
		}, 3000);
		return;
	}

	await initSettings();

	if (window === window.top) {
		if (!params.has('redirect')) {
			const tabCloak = await readSetting('tabCloak', 'None');
			const autoBlank = await readSetting('autoAboutBlank', false);
			const autoBlob = await readSetting('autoBlob', false);

			await applyCloak(tabCloak);

			if (autoBlank) {
				await launchAboutBlank(tabCloak);
				return;
			}
			if (autoBlob) {
				await launchBlob(tabCloak);
				return;
			}
		}
	}

	const runtime = await selectRuntime(window, () =>
		createStandaloneRuntime(prepareRuntimeScripts)
	);
	window.proxy = runtime;
	await initShadowApp(runtime);
};

const originalDocumentOpen = document.open.bind(document);
const originalDocumentWrite = document.write.bind(document);
const originalDocumentWriteln = document.writeln.bind(document);
const originalDocumentClose = document.close.bind(document);

let shadowRoot: ShadowRoot | null = null;
let shadowDocument: Document | null = null;

const runtimeScriptSources = [assetUrl('/space-runtime.js')];

const loadRuntimeScript = (src: string) =>
	new Promise<void>((resolve, reject) => {
		const selector = `script[data-runtime-src="${src}"]`;
		const existing =
			document.head.querySelector<HTMLScriptElement>(selector);
		const handleLoad = (script: HTMLScriptElement) => {
			script.dataset.runtimeReady = 'true';
			resolve();
		};
		const handleError = () => {
			reject(new Error(`Failed to load runtime script: ${src}`));
		};
		const attachListeners = (script: HTMLScriptElement) => {
			script.addEventListener('load', () => handleLoad(script), {
				once: true
			});
			script.addEventListener('error', handleError, { once: true });
		};

		switch (true) {
			case existing?.dataset.runtimeReady === 'true':
				resolve();
				return;
			case Boolean(existing):
				attachListeners(existing as HTMLScriptElement);
				return;
			default: {
				const script = document.createElement('script');
				script.src = src;
				script.dataset.runtimeSrc = src;
				attachListeners(script);
				document.head.appendChild(script);
			}
		}
	});

const prepareRuntimeScripts = async () => {
	for (const src of runtimeScriptSources) {
		try {
			await loadRuntimeScript(src);
		} catch (error) {
			console.error('[runtime] script load failed', src, error);
			throw error;
		}
	}
};

const patchDocument = () => {
	Object.defineProperty(document, 'open', {
		value: (...args: Parameters<typeof document.open>) => {
			if (shadowDocument) {
				return shadowDocument;
			}
			return originalDocumentOpen(...args);
		},
		writable: true,
		configurable: true
	});

	Object.defineProperty(document, 'write', {
		value: (...text: Parameters<typeof document.write>) => {
			// The SVG bootstrap owns insertion into the outer foreignObject body.
			// Ad scripts must not be redirected into the app's closed shadow root.
			if (document.contentType === 'image/svg+xml') {
				return originalDocumentWrite(...text);
			}
			if (shadowRoot) {
				const temp = document.createElement('div');
				temp.innerHTML = text.join('');
				while (temp.firstChild) {
					shadowRoot.appendChild(temp.firstChild);
				}
				return;
			}
			return originalDocumentWrite(...text);
		},
		writable: true,
		configurable: true
	});

	Object.defineProperty(document, 'writeln', {
		value: (...text: Parameters<typeof document.writeln>) => {
			if (document.contentType === 'image/svg+xml') {
				return originalDocumentWriteln(...text);
			}
			if (shadowRoot) {
				const temp = document.createElement('div');
				temp.innerHTML = text.join('') + '\n';
				while (temp.firstChild) {
					shadowRoot.appendChild(temp.firstChild);
				}
				return;
			}
			return originalDocumentWriteln(...text);
		},
		writable: true,
		configurable: true
	});

	Object.defineProperty(document, 'close', {
		value: () => {
			if (shadowRoot) {
				return;
			}
			return originalDocumentClose();
		},
		writable: true,
		configurable: true
	});
};

const initShadowApp = async (runtime: SpaceRuntime) => {
	const staticShell = document.getElementById('static-shell');
	if (staticShell) {
		staticShell.style.display = 'none';
	}

	const appHost = document.getElementById('app-host')!;
	shadowRoot = appHost.attachShadow({
		mode: getShadowMode(import.meta.env.DEV)
	});

	const styleSheet = document.createElement('style');
	styleSheet.textContent = indexStyles;
	shadowRoot.appendChild(styleSheet);
	// Font readiness must never block app startup; failure keeps original text.
	void installFontRuntime(shadowRoot).then(fonts => {
		window.addEventListener('pagehide', event => {
			if (!event.persisted) fonts.dispose();
		});
	});

	const root = document.createElement('div');
	root.id = 'root';
	root.style.width = '100%';
	root.style.height = '100%';
	root.style.position = 'fixed';
	root.style.inset = '0';
	shadowRoot.appendChild(root);

	shadowDocument = document.implementation.createHTMLDocument('');

	patchDocument();
	createRoot(root).render(
		<MemoryRouter initialEntries={[initialView(window.location.search)]}>
			<SvgReady />
			<Routes>
				<Route path="/" element={<App runtime={runtime} />}>
					<Route
						path="games"
						element={
							<Suspense fallback={<Loading />}>
								<GamesPage />
							</Suspense>
						}
					/>
					<Route
						path="settings"
						element={
							<Suspense fallback={<Loading />}>
								<SettingsPage />
							</Suspense>
						}
					/>
					<Route
						path="playback"
						element={
							<Suspense fallback={<Loading />}>
								<PlaybackPage />
							</Suspense>
						}
					/>
					<Route
						path="admin"
						element={
							<Suspense fallback={<Loading />}>
								<AdminPage />
							</Suspense>
						}
					/>
				</Route>
			</Routes>
		</MemoryRouter>
	);
};

boot();
