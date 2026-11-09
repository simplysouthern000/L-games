import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from './components/Sidebar';
import { LiveControls } from './components/LiveControls';
import { TopBar } from './components/TopBar';
import { SpaceStars } from './components/SpaceStars';
import {
	SessionOverlay,
	type SessionLoadStatus
} from './components/SessionOverlay';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { readSetting, useLocalStorage } from './hooks/useLocalStorage';
import { useTabCloak } from './hooks/useTabCloak';
import type { SpaceRuntime } from './runtime';
import {
	defaultSearchTemplate,
	formatInput,
	normalizeGameDocumentUrl,
	resolveNavigation
} from './runtime/navigation';
import { applyAccentColor } from './runtime/accent-color';
import { getDefaultPagePath } from './utils/internal-pages';
import { assetUrl } from './runtime/asset-url';
import {
	buildSavedGameRecord,
	createInitialSessionHistory,
	createSessionHistoryEntry,
	emptyPlaybackState,
	emptySavedGamesState,
	findSavedGameByUrl,
	getGameLibraryStatus,
	getHostLabel,
	isLikelyUrlInput,
	isRemovedGameUrl,
	moveSessionHistoryIndex,
	normalizeComparableUrl,
	pushPlaybackMediaEntry,
	pushPlaybackSearchEntry,
	pushSessionHistoryEntry,
	syncPlaybackMediaEntry,
	syncPlaybackSearchEntry,
	syncSessionHistoryEntry,
	type NavigationMeta,
	type PlaybackKind,
	type SessionHistoryState
} from './utils/playback';
import {
	defaultPins,
	isPinned as isUrlPinned,
	togglePin,
	type PinnedShortcut
} from './utils/pins';

const maxSessionsLimit = 9;

const getScreenCap = (): number => {
	const h = window.innerHeight;
	if (h < 600) return 3;
	if (h < 800) return 5;
	if (h < 1000) return 7;
	return maxSessionsLimit;
};

import './App.css';

const newTabUrl = getDefaultPagePath();

export interface Session {
	id: number;
	url: string;
}

interface SpaceNavigateDetail {
	url?: string;
	target?: 'active' | 'new';
	title?: string;
	image?: string;
	tags?: string[];
	kind?: PlaybackKind;
	librarySource?: 'default' | 'custom' | null;
}

interface NavigateSessionOptions extends NavigationMeta {
	historyMode?: 'push' | 'sync';
	recordSearch?: boolean;
}

type SiteControls = { maintenanceMode: boolean; gamesDisabled: boolean; proxyDisabled: boolean };

const App = ({ runtime }: { runtime: SpaceRuntime }) => {
	useTabCloak();
	const location = useLocation();
	const navigate = useNavigate();
	const activeItem = location.pathname.replace('/', '') || 'home';
	const [sidebarHovered, setSidebarHovered] = useState(false);
	const [autoHideSidebar] = useLocalStorage('autoHideSidebar', false);
	const [particles] = useLocalStorage('particles', true);
	const [bgMode] = useLocalStorage('bgMode', 'solid');
	const [bgValue] = useLocalStorage('bgValue', '#000000');
	const [themeColor] = useLocalStorage('themeColor', '#0045ff');
	const [isAdmin, setIsAdmin] = useState(false);
	const [siteControls, setSiteControls] = useState<SiteControls>({ maintenanceMode: false, gamesDisabled: false, proxyDisabled: false });
	const [autoCapSessions] = useLocalStorage('autoCapSessions', true);
	const [savedGamesState, setSavedGamesState] = useLocalStorage(
		'savedGamesState',
		emptySavedGamesState
	);
	const [, setPlaybackState] = useLocalStorage(
		'playbackState',
		emptyPlaybackState
	);
	const [pinnedShortcuts, setPinnedShortcuts] = useLocalStorage<
		PinnedShortcut[]
	>('pinnedShortcuts', defaultPins);
	const [screenCap, setScreenCap] = useState(getScreenCap);
	const maxSessions = autoCapSessions
		? Math.min(screenCap, maxSessionsLimit)
		: maxSessionsLimit;

	useEffect(() => {
		void fetch('/api/auth/status')
			.then(response => (response.ok ? response.json() : null))
			.then(data => setIsAdmin(data?.isAdmin === true))
			.catch(() => setIsAdmin(false));
	}, []);
	useEffect(() => {
		const load = () => void fetch('/api/site-controls').then(response => response.ok ? response.json() : null).then(data => { if (data) setSiteControls(data); }).catch(() => undefined);
		load(); const timer = window.setInterval(load, 5000); return () => window.clearInterval(timer);
	}, []);

	useEffect(() => {
		if (!autoCapSessions) return;
		const onResize = () => setScreenCap(getScreenCap());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [autoCapSessions]);

	useEffect(() => {
		if (typeof document !== 'undefined') {
			const appHost = document.getElementById('app-host');
			if (appHost) applyAccentColor(appHost.style, themeColor);
		}
	}, [themeColor]);
	const nextIdRef = useRef(1);
	const carouselRef = useRef<HTMLDivElement>(null);
	const rawSessions = useRef<Session[]>([{ id: 0, url: '' }]);
	const [sessions, setSessions] = useState<Session[]>([{ id: 0, url: '' }]);
	const [activeSession, setActiveSession] = useState(0);
	const [sessionHistoryMap, setSessionHistoryMap] = useState<
		Record<number, SessionHistoryState>
	>(() => ({
		0: createInitialSessionHistory()
	}));
	const [proxyReady, setProxyReady] = useState(false);
	const [sessionLoad, setSessionLoad] = useState<
		Record<number, { status: SessionLoadStatus; slow: boolean }>
	>({});

	const navigationOwnersRef = useRef<
		Record<number, { token: symbol; preparing: boolean }>
	>({});
	const loadTimersRef = useRef<
		Record<
			number,
			{
				slow?: ReturnType<typeof setTimeout>;
				error?: ReturnType<typeof setTimeout>;
			}
		>
	>({});

	const clearSessionLoadTimers = useCallback((id: number) => {
		const timers = loadTimersRef.current[id];
		if (!timers) return;
		if (timers.slow) clearTimeout(timers.slow);
		if (timers.error) clearTimeout(timers.error);
		delete loadTimersRef.current[id];
	}, []);

	const beginSessionLoad = useCallback(
		(id: number) => {
			clearSessionLoadTimers(id);
			setSessionLoad(previous => ({
				...previous,
				[id]: { status: 'loading', slow: false }
			}));
			const slow = setTimeout(() => {
				setSessionLoad(previous =>
					previous[id]?.status === 'loading'
						? {
								...previous,
								[id]: { status: 'loading', slow: true }
							}
						: previous
				);
			}, 9000);
			const error = setTimeout(() => {
				setSessionLoad(previous =>
					previous[id]?.status === 'loading'
						? {
								...previous,
								[id]: { status: 'error', slow: false }
							}
						: previous
				);
			}, 30000);
			loadTimersRef.current[id] = { slow, error };
		},
		[clearSessionLoadTimers]
	);

	const finishSessionLoad = useCallback(
		(id: number, status: SessionLoadStatus) => {
			// A load from the previous document cannot finish async preparation.
			if (navigationOwnersRef.current[id]?.preparing) return;
			delete navigationOwnersRef.current[id];
			clearSessionLoadTimers(id);
			setSessionLoad(previous => ({
				...previous,
				[id]: { status, slow: false }
			}));
		},
		[clearSessionLoadTimers]
	);

	useEffect(() => {
		const timers = loadTimersRef.current;
		return () => {
			navigationOwnersRef.current = {};
			Object.values(timers).forEach(timer => {
				if (timer.slow) clearTimeout(timer.slow);
				if (timer.error) clearTimeout(timer.error);
			});
		};
	}, []);

	useEffect(() => {
		runtime.ready
			.then(() => {
				setProxyReady(runtime.mode !== 'unavailable');
			})
			.catch(error => {
				console.error('[App] Proxy initialization failed', error);
			});
	}, [runtime]);

	const recordSessionVisit = useCallback(
		(entry: ReturnType<typeof createSessionHistoryEntry>) => {
			switch (entry.kind) {
				case 'game':
					setPlaybackState(previousState => ({
						...previousState,
						games: pushPlaybackMediaEntry(
							previousState.games,
							entry
						)
					}));
					return;
				default:
					return;
			}
		},
		[setPlaybackState]
	);

	const syncSessionVisit = useCallback(
		(entry: ReturnType<typeof createSessionHistoryEntry>) => {
			switch (entry.kind) {
				case 'game':
					setPlaybackState(previousState => ({
						...previousState,
						games: syncPlaybackMediaEntry(
							previousState.games,
							entry
						)
					}));
					return;
				default:
					return;
			}
		},
		[setPlaybackState]
	);

	const recordSearchVisit = useCallback(
		(
			entry: ReturnType<typeof createSessionHistoryEntry>,
			query = entry.url || entry.title,
			title = entry.title
		) => {
			setPlaybackState(previousState => ({
				...previousState,
				searches: pushPlaybackSearchEntry(
					previousState.searches,
					query,
					entry.url,
					title
				)
			}));
		},
		[setPlaybackState]
	);

	const syncSearchVisit = useCallback(
		(
			entry: ReturnType<typeof createSessionHistoryEntry>,
			query: string | null = null,
			title?: string
		) => {
			setPlaybackState(previousState => ({
				...previousState,
				searches: syncPlaybackSearchEntry(
					previousState.searches,
					query,
					entry.url,
					title
				)
			}));
		},
		[setPlaybackState]
	);

	const navigateSession = useCallback(
		async (
			sessionId: number,
			input: string,
			options: NavigateSessionOptions = {}
		) => {
			if (!rawSessions.current.some(session => session.id === sessionId))
				return;
			if (siteControls.maintenanceMode || (siteControls.proxyDisabled && input.trim())) return;
			const owner = { token: Symbol('navigation'), preparing: true };
			navigationOwnersRef.current[sessionId] = owner;
			const nextInput = input.trim();
			const historyMode = options.historyMode ?? 'push';
			let isInternalTarget = nextInput.length === 0;

			try {
				let resolvedUrl = '';
				let isSearch = false;

				switch (isInternalTarget) {
					case true:
						break;
					default: {
						await runtime.ready;
						const template = await readSetting(
							'search',
							defaultSearchTemplate
						);
						const navigationInput = options.kind === 'game'
							? normalizeGameDocumentUrl(nextInput, window.location.origin)
							: nextInput;
						const target = resolveNavigation(
							formatInput(navigationInput, template),
							window.location.origin
						);
						resolvedUrl =
							target.kind === 'internal' ? '' : target.url;
						isInternalTarget = target.kind === 'internal';
						isSearch = !isLikelyUrlInput(nextInput);
					}
				}

				const idx = rawSessions.current.findIndex(
					session => session.id === sessionId
				);
				if (
					navigationOwnersRef.current[sessionId] !== owner ||
					idx === -1
				)
					return;
				owner.preparing = false;

				switch (idx !== -1) {
					case true:
						rawSessions.current[idx].url = resolvedUrl;
						setSessions([...rawSessions.current]);
						break;
					default:
						break;
				}

				switch (isInternalTarget) {
					case false:
						beginSessionLoad(sessionId);
						break;
					default:
						finishSessionLoad(sessionId, 'ready');
						break;
				}

				const customSavedGame = findSavedGameByUrl(
					savedGamesState,
					resolvedUrl
				);
				const nextEntry = createSessionHistoryEntry(
					isInternalTarget ? newTabUrl : resolvedUrl,
					{
						...options,
						kind: isInternalTarget
							? 'internal'
							: (options.kind ?? 'search'),
						librarySource: customSavedGame
							? 'custom'
							: (options.librarySource ?? null)
					}
				);

				setSessionHistoryMap(previousState => {
					const currentState =
						previousState[sessionId] ??
						createInitialSessionHistory();
					const nextState =
						historyMode === 'sync'
							? syncSessionHistoryEntry(currentState, nextEntry)
							: pushSessionHistoryEntry(currentState, nextEntry);

					return {
						...previousState,
						[sessionId]: nextState
					};
				});

				switch (nextEntry.kind) {
					case 'game':
						recordSessionVisit(nextEntry);
						break;
					case 'search':
						recordSearchVisit(
							nextEntry,
							isSearch && Boolean(options.recordSearch)
								? nextInput
								: undefined,
							isSearch && Boolean(options.recordSearch)
								? nextInput
								: undefined
						);
						break;
					default:
						break;
				}
			} catch (error) {
				if (navigationOwnersRef.current[sessionId] !== owner) return;
				owner.preparing = false;
				console.error('[App] Session navigation failed', error);
				finishSessionLoad(sessionId, 'error');
			}
		},
		[
			beginSessionLoad,
			runtime,
			finishSessionLoad,
			recordSearchVisit,
			recordSessionVisit,
			savedGamesState,
			siteControls.maintenanceMode,
			siteControls.proxyDisabled
		]
	);

	useEffect(() => {
		rawSessions.current = sessions;
	}, [sessions]);

	const navigateFromGamesPage = useCallback(
		(detail: SpaceNavigateDetail) => {
			if (siteControls.maintenanceMode || siteControls.gamesDisabled) return;
			const nextUrl = detail.url?.trim();

			switch (true) {
				case !nextUrl:
					return;
				default:
					break;
			}

			const openInNewSession =
				detail.target === 'new' &&
				rawSessions.current.length < maxSessions;

			switch (openInNewSession) {
				case true: {
					const nextId = nextIdRef.current++;
					rawSessions.current.push({ id: nextId, url: '' });
					setSessions([...rawSessions.current]);
					setSessionHistoryMap(previousState => ({
						...previousState,
						[nextId]: createInitialSessionHistory()
					}));
					setActiveSession(nextId);
					navigate('/');
					void navigateSession(nextId, nextUrl, {
						title: detail.title,
						image: detail.image,
						tags: detail.tags,
						kind: detail.kind,
						librarySource: detail.librarySource
					});
					return;
				}
				default:
					navigate('/');
					void navigateSession(activeSession, nextUrl, {
						title: detail.title,
						image: detail.image,
						tags: detail.tags,
						kind: detail.kind,
						librarySource: detail.librarySource
					});
			}
		},
		[activeSession, maxSessions, navigate, navigateSession]
	);

	const handleSessionLocationChange = useCallback(
		(sessionId: number, url: string, title: string) => {
			// The prior document can still be observed while a selected Back/Forward
			// target is loading. It is not a new visit and must not truncate history.
			// Read live ownership, not a render's possibly stale loading snapshot.
			if (
				navigationOwnersRef.current[sessionId]?.preparing ||
				loadTimersRef.current[sessionId]
			)
				return;
			const nextUrl = url.trim();

			switch (nextUrl.length === 0) {
				case true:
					return;
				default:
					break;
			}

			const currentState =
				sessionHistoryMap[sessionId] ?? createInitialSessionHistory();
			const currentEntry =
				currentState.entries[currentState.index] ??
				createSessionHistoryEntry(newTabUrl, { kind: 'internal' });
			const currentHost = getHostLabel(currentEntry.url);
			const nextHost = getHostLabel(nextUrl);
			const customSavedGame = findSavedGameByUrl(
				savedGamesState,
				nextUrl
			);
			const keepGameState =
				currentEntry.kind === 'game' &&
				currentHost === nextHost &&
				!isRemovedGameUrl(savedGamesState, nextUrl);
			const keepSearchState =
				currentEntry.kind === 'search' && currentHost === nextHost;
			const nextEntry = createSessionHistoryEntry(nextUrl, {
				title,
				image: keepGameState ? currentEntry.image : undefined,
				tags: keepGameState ? currentEntry.tags : [],
				kind: customSavedGame
					? 'game'
					: keepGameState
						? 'game'
						: keepSearchState
							? 'search'
							: 'search',
				librarySource: customSavedGame
					? 'custom'
					: keepGameState
						? currentEntry.librarySource
						: null
			});

			switch (currentEntry.normalizedUrl === nextEntry.normalizedUrl) {
				case true:
					setSessionHistoryMap(previousState => ({
						...previousState,
						[sessionId]: syncSessionHistoryEntry(
							previousState[sessionId] ??
								createInitialSessionHistory(),
							nextEntry
						)
					}));
					switch (nextEntry.kind) {
						case 'search':
							syncSearchVisit(nextEntry);
							return;
						default:
							syncSessionVisit(nextEntry);
							return;
					}
				default:
					setSessionHistoryMap(previousState => ({
						...previousState,
						[sessionId]: pushSessionHistoryEntry(
							previousState[sessionId] ??
								createInitialSessionHistory(),
							nextEntry
						)
					}));

					switch (nextEntry.kind) {
						case 'game':
							recordSessionVisit(nextEntry);
							return;
						case 'search':
							recordSearchVisit(nextEntry);
							return;
						default:
							return;
					}
			}
		},
		[
			recordSearchVisit,
			recordSessionVisit,
			savedGamesState,
			sessionHistoryMap,
			syncSearchVisit,
			syncSessionVisit,
			siteControls.maintenanceMode,
			siteControls.gamesDisabled
		]
	);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type !== 'newtab-navigate') return;
			const url = event.data.url;
			if (!url || typeof url !== 'string') return;

			const root = carouselRef.current;
			if (!root) return;
			const iframes = root.querySelectorAll<HTMLIFrameElement>(
				'iframe[data-session-uid]'
			);
			for (const iframe of iframes) {
				if (iframe.contentWindow === event.source) {
					const sessionUid = Number(iframe.dataset.sessionUid);
					if (!isNaN(sessionUid)) {
						navigateSession(sessionUid, url, {
							recordSearch: true
						});
					}
					return;
				}
			}

			navigateSession(activeSession, url, {
				recordSearch: true
			});
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [navigateSession, activeSession]);

	useEffect(() => {
		const handleSpaceNavigate = (event: Event) => {
			navigateFromGamesPage(
				(event as CustomEvent<SpaceNavigateDetail>).detail ?? {}
			);
		};

		window.addEventListener(
			'space:navigate',
			handleSpaceNavigate as EventListener
		);
		return () =>
			window.removeEventListener(
				'space:navigate',
				handleSpaceNavigate as EventListener
			);
	}, [navigateFromGamesPage]);

	useEffect(() => {
		const root = carouselRef.current;
		if (!root) return;
		for (const s of sessions) {
			const iframe = root.querySelector<HTMLIFrameElement>(
				`iframe[data-session-uid="${s.id}"]`
			);
			if (!iframe) continue;

			if (iframe.dataset.sessionTarget === s.url) continue;
			iframe.dataset.sessionTarget = s.url;

			const owner = navigationOwnersRef.current[s.id];

			void runtime.navigate(iframe, s.url || newTabUrl).catch(error => {
				if (navigationOwnersRef.current[s.id] !== owner) return;
				console.error('[App] Session navigation failed', error);
				finishSessionLoad(s.id, 'error');
			});
		}
	}, [sessions, finishSessionLoad, runtime]);

	const handleNavClick = (id: string) => {
		navigate(id === 'home' ? '/' : `/${id}`);
	};

	const handleAddSession = () => {
		switch (rawSessions.current.length >= maxSessions) {
			case true:
				return;
			default:
				break;
		}

		const newId = nextIdRef.current++;
		const entry: Session = { id: newId, url: '' };
		rawSessions.current.push(entry);
		setSessions([...rawSessions.current]);
		setSessionHistoryMap(previousState => ({
			...previousState,
			[newId]: createInitialSessionHistory()
		}));
		setActiveSession(newId);
		navigate('/');
	};

	const handleCloseSession = (id: number) => {
		const idx = rawSessions.current.findIndex(s => s.id === id);
		switch (idx === -1) {
			case true:
				return;
			default:
				break;
		}
		rawSessions.current.splice(idx, 1);
		delete navigationOwnersRef.current[id];
		clearSessionLoadTimers(id);

		if (rawSessions.current.length === 0) {
			const fallbackId = nextIdRef.current++;
			const fallback: Session = {
				id: fallbackId,
				url: ''
			};
			rawSessions.current.push(fallback);
			setActiveSession(fallbackId);
		} else if (activeSession === id) {
			const newActive =
				rawSessions.current[
					Math.min(idx, rawSessions.current.length - 1)
				];
			setActiveSession(newActive.id);
		}

		setSessions([...rawSessions.current]);
		setSessionHistoryMap(previousState => {
			const nextState = { ...previousState };
			delete nextState[id];

			switch (rawSessions.current.length === 1) {
				case true: {
					const fallbackSession = rawSessions.current[0];
					nextState[fallbackSession.id] =
						nextState[fallbackSession.id] ??
						createInitialSessionHistory();
					break;
				}
				default:
					break;
			}

			return nextState;
		});
		switch (isSpecialPage && activeSession === id) {
			case true:
				navigate('/');
				break;
			default:
				break;
		}
	};

	const isSpecialPage =
		activeItem === 'games' ||
		activeItem === 'settings' ||
		activeItem === 'playback' ||
		activeItem === 'admin';

	const activeSessionHistory =
		sessionHistoryMap[activeSession] ?? createInitialSessionHistory();
	const activeHistoryEntry =
		activeSessionHistory.entries[activeSessionHistory.index] ??
		createSessionHistoryEntry(newTabUrl, { kind: 'internal' });
	const liveActivity = isSpecialPage
		? activeItem === 'admin' ? 'Admin panel' : activeItem[0].toUpperCase() + activeItem.slice(1)
		: activeHistoryEntry.url
			? `${activeHistoryEntry.title || 'Browsing'} · ${activeHistoryEntry.url}`
			: 'Search';
	const livePreviewUrl = /^https?:\/\//i.test(activeHistoryEntry.url) ? activeHistoryEntry.url : undefined;
	const blockedReason = !isAdmin && siteControls.maintenanceMode
		? 'Space is currently in maintenance mode.'
		: !isAdmin && siteControls.gamesDisabled && (activeItem === 'games' || activeHistoryEntry.kind === 'game')
			? 'Games are temporarily disabled.'
			: !isAdmin && siteControls.proxyDisabled && !isSpecialPage && Boolean(activeHistoryEntry.url)
				? 'Proxy browsing is temporarily disabled.'
				: null;
	const canGoBack = activeSessionHistory.index > 0;
	const canGoForward =
		activeSessionHistory.index < activeSessionHistory.entries.length - 1;
	const gameLibraryStatus = getGameLibraryStatus(
		activeHistoryEntry,
		savedGamesState
	);
	const isOnInternalPage = activeHistoryEntry.kind === 'internal';
	const canTogglePin =
		!isOnInternalPage && Boolean(activeHistoryEntry.url.trim());
	const pinnedState = canTogglePin
		? isUrlPinned(pinnedShortcuts, activeHistoryEntry.url)
		: false;

	const [switching, setSwitching] = useState(false);
	const [siblingsOpaque, setSiblingsOpaque] = useState(false);
	const [siblingsVisible, setSiblingsVisible] = useState(false);
	const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
			if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, []);

	const handleSessionSwitch = (id: number) => {
		switch (id === activeSession) {
			case true:
				switch (isSpecialPage) {
					case true:
						navigate('/');
						break;
					default:
						break;
				}
				return;
			default:
				break;
		}
		setSwitching(true);
		setSiblingsOpaque(true);
		setSiblingsVisible(true);
		setActiveSession(id);
		switch (isSpecialPage) {
			case true:
				navigate('/');
				break;
			default:
				break;
		}
		if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
		if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		switchTimerRef.current = setTimeout(() => setSwitching(false), 500);
		fadeTimerRef.current = setTimeout(() => setSiblingsOpaque(false), 500);
		hideTimerRef.current = setTimeout(() => setSiblingsVisible(false), 900);
	};

	const getActiveIframe = useCallback((): HTMLIFrameElement | null => {
		const activeIndex = sessions.findIndex(x => x.id === activeSession);
		const root = carouselRef.current;
		if (!root) return null;
		const containers = root.querySelectorAll('.iframeContainer');
		const container = containers[activeIndex];
		if (!container) return null;
		return container.querySelector('iframe') as HTMLIFrameElement | null;
	}, [sessions, activeSession]);

	const handleIframeBack = useCallback(() => {
		switch (canGoBack) {
			case false:
				return;
			default:
				break;
		}

		const nextIndex = activeSessionHistory.index - 1;
		const nextEntry = activeSessionHistory.entries[nextIndex];

		switch (Boolean(nextEntry)) {
			case false:
				return;
			default:
				setSessionHistoryMap(previousState => ({
					...previousState,
					[activeSession]: moveSessionHistoryIndex(
						previousState[activeSession] ??
							createInitialSessionHistory(),
						nextIndex
					)
				}));
				void navigateSession(activeSession, nextEntry!.url, {
					title: nextEntry!.title,
					image: nextEntry!.image,
					tags: nextEntry!.tags,
					kind: nextEntry!.kind,
					librarySource: nextEntry!.librarySource,
					historyMode: 'sync'
				});
		}
	}, [activeSession, activeSessionHistory, canGoBack, navigateSession]);

	const handleIframeForward = useCallback(() => {
		switch (canGoForward) {
			case false:
				return;
			default:
				break;
		}

		const nextIndex = activeSessionHistory.index + 1;
		const nextEntry = activeSessionHistory.entries[nextIndex];

		switch (Boolean(nextEntry)) {
			case false:
				return;
			default:
				setSessionHistoryMap(previousState => ({
					...previousState,
					[activeSession]: moveSessionHistoryIndex(
						previousState[activeSession] ??
							createInitialSessionHistory(),
						nextIndex
					)
				}));
				void navigateSession(activeSession, nextEntry!.url, {
					title: nextEntry!.title,
					image: nextEntry!.image,
					tags: nextEntry!.tags,
					kind: nextEntry!.kind,
					librarySource: nextEntry!.librarySource,
					historyMode: 'sync'
				});
		}
	}, [activeSession, activeSessionHistory, canGoForward, navigateSession]);

	const handleIframeReload = useCallback(() => {
		const iframe = getActiveIframe();
		if (!iframe) return;

		beginSessionLoad(activeSession);

		void runtime
			.navigate(iframe, activeHistoryEntry.url || newTabUrl)
			.catch(() => {
				finishSessionLoad(activeSession, 'error');
			});
	}, [
		getActiveIframe,
		activeSession,
		activeHistoryEntry.url,
		beginSessionLoad,
		finishSessionLoad,
		runtime
	]);

	const handleSessionRetry = useCallback(
		(id: number) => {
			const root = carouselRef.current;
			const iframe = root?.querySelector<HTMLIFrameElement>(
				`iframe[data-session-uid="${id}"]`
			);
			const data = rawSessions.current.find(s => s.id === id);
			beginSessionLoad(id);
			if (!iframe) return;

			void runtime
				.navigate(iframe, data?.url || newTabUrl)
				.catch(error => {
					console.error('[App] Session retry failed', error);
					finishSessionLoad(id, 'error');
				});
		},
		[beginSessionLoad, finishSessionLoad, runtime]
	);

	const handleSessionHome = useCallback(
		(id: number) => {
			finishSessionLoad(id, 'ready');
			void navigateSession(id, '');
		},
		[finishSessionLoad, navigateSession]
	);

	const handleSessionReport = useCallback(
		(id: number) => {
			const history =
				sessionHistoryMap[id] ?? createInitialSessionHistory();
			const entry = history.entries[history.index];
			const url = entry?.url || '';
			const title = `Broken page: ${entry?.title || getHostLabel(url)}`;
			const body = [
				`URL: ${url}`,
				`Proxy: ${runtime.mode}`,
				'',
				'What went wrong?'
			].join('\n');
			const query = new URLSearchParams({ title, body });
			window.open(
				`https://github.com/crllect/space-v2/issues/new?${query.toString()}`,
				'_blank'
			);
		},
		[sessionHistoryMap, runtime]
	);

	const handleToggleSavedGame = useCallback(() => {
		switch (gameLibraryStatus.canToggle) {
			case false:
				return;
			default:
				break;
		}

		const normalizedUrl = activeHistoryEntry.normalizedUrl;

		switch (gameLibraryStatus.isSaved) {
			case true: {
				const nextEntry = createSessionHistoryEntry(
					activeHistoryEntry.url,
					{
						...activeHistoryEntry,
						kind: 'search',
						librarySource: null
					}
				);

				setSavedGamesState(previousState => {
					const nextCustomGames = previousState.customGames.filter(
						game =>
							normalizeComparableUrl(game.url) !== normalizedUrl
					);
					const nextRemovedGameUrls =
						gameLibraryStatus.librarySource === 'default'
							? [
									...previousState.removedGameUrls.filter(
										url =>
											normalizeComparableUrl(url) !==
											normalizedUrl
									),
									activeHistoryEntry.url
								]
							: previousState.removedGameUrls.filter(
									url =>
										normalizeComparableUrl(url) !==
										normalizedUrl
								);

					return {
						customGames: nextCustomGames,
						removedGameUrls: nextRemovedGameUrls
					};
				});
				setSessionHistoryMap(previousState => ({
					...previousState,
					[activeSession]: syncSessionHistoryEntry(
						previousState[activeSession] ??
							createInitialSessionHistory(),
						nextEntry
					)
				}));
				return;
			}
			default: {
				const nextEntry = createSessionHistoryEntry(
					activeHistoryEntry.url,
					{
						...activeHistoryEntry,
						kind: 'game',
						librarySource: 'custom'
					}
				);

				setSavedGamesState(previousState => {
					const nextCustomGame = buildSavedGameRecord(nextEntry);
					const nextCustomGames = [
						nextCustomGame,
						...previousState.customGames.filter(
							game =>
								normalizeComparableUrl(game.url) !==
								normalizedUrl
						)
					];

					return {
						customGames: nextCustomGames,
						removedGameUrls: previousState.removedGameUrls.filter(
							url => normalizeComparableUrl(url) !== normalizedUrl
						)
					};
				});
				setSessionHistoryMap(previousState => ({
					...previousState,
					[activeSession]: syncSessionHistoryEntry(
						previousState[activeSession] ??
							createInitialSessionHistory(),
						nextEntry
					)
				}));
				recordSessionVisit(nextEntry);
			}
		}
	}, [
		activeHistoryEntry,
		activeSession,
		gameLibraryStatus,
		recordSessionVisit,
		setSavedGamesState
	]);

	const handleTogglePin = useCallback(() => {
		switch (canTogglePin) {
			case false:
				return;
			default:
				setPinnedShortcuts(previous =>
					togglePin(previous, {
						url: activeHistoryEntry.url,
						name: activeHistoryEntry.title
					})
				);
		}
	}, [
		activeHistoryEntry.title,
		activeHistoryEntry.url,
		canTogglePin,
		setPinnedShortcuts
	]);

	const renderMainContent = () => {
		const isPage = isSpecialPage;
		const activeIndex = sessions.findIndex(x => x.id === activeSession);

		return (
			<div className="relative w-full h-full">
				<motion.div
					ref={carouselRef}
					initial={false}
					animate={{
						scale: isPage ? 0.94 : switching ? 0.85 : 1,
						opacity: isPage ? 0 : switching ? 0.7 : 1,
						y: isPage ? -20 : 0
					}}
					transition={{
						type: 'spring',
						stiffness: 220,
						damping: 28,
						mass: 0.6
					}}
					className="absolute inset-2"
					style={{
						pointerEvents: isPage ? 'none' : 'auto',
						borderRadius: 12,
						willChange: 'transform, opacity',
						backfaceVisibility: 'hidden',
						WebkitBackfaceVisibility: 'hidden'
					}}
				>
					<motion.div
						animate={{
							x: `calc(${-activeIndex * (100 / sessions.length)}% - ((${activeIndex}) * 8px))`
						}}
						transition={{
							type: 'spring',
							stiffness: 650,
							damping: 75
						}}
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							height: '100%',
							display: 'flex',
							width: `${sessions.length * 100}%`,
							willChange: 'transform',
							backfaceVisibility: 'hidden',
							WebkitBackfaceVisibility: 'hidden'
						}}
					>
						{sessions.map((s, index) => {
							const isActive = index === activeIndex;
							const load = sessionLoad[s.id];
							const history = sessionHistoryMap[s.id];
							const entry = history?.entries[history.index ?? 0];
							const overlayLabel = entry?.url
								? entry.title || getHostLabel(entry.url)
								: '';
							return (
								<div
									key={s.id}
									className="iframeContainer"
									style={{
										position: 'relative',
										width: `${100 / sessions.length}%`,
										height: '100%',
										flexShrink: 0,
										pointerEvents: isActive
											? 'auto'
											: 'none',
										opacity: isActive
											? 1
											: siblingsOpaque
												? 0.7
												: 0,
										transition: 'opacity 0.4s ease',
										visibility:
											isActive || siblingsVisible
												? 'visible'
												: 'hidden',
										paddingLeft: '0px',
										marginRight: '8px'
									}}
								>
									<iframe
										src={assetUrl(newTabUrl)}
										data-session-id={index}
										data-session-uid={s.id}
										className="w-full h-full"
										onLoad={() =>
											finishSessionLoad(s.id, 'ready')
										}
										style={{
											borderRadius: 12,
											border: 'none'
										}}
									/>
									{load && (
										<SessionOverlay
											status={load.status}
											slow={load.slow}
											label={overlayLabel}
											onRetry={() =>
												handleSessionRetry(s.id)
											}
											onHome={() =>
												handleSessionHome(s.id)
											}
											onReport={() =>
												handleSessionReport(s.id)
											}
										/>
									)}
								</div>
							);
						})}
					</motion.div>
				</motion.div>

				{isPage && (
					<motion.div
						key={location.pathname}
						initial={{
							opacity: 0,
							scale: 0.96,
							y: 12,
							filter: 'blur(10px)'
						}}
						animate={{
							opacity: 1,
							scale: 1,
							y: 0,
							filter: 'blur(0px)'
						}}
						transition={{
							type: 'spring',
							stiffness: 280,
							damping: 26,
							mass: 1,
							filter: { duration: 0.2 }
						}}
						className="absolute inset-0"
					>
						<Outlet />
					</motion.div>
				)}
			</div>
		);
	};

	const bgStyle = (() => {
		if (particles) return { backgroundColor: 'transparent' };
		switch (bgMode) {
			case 'image':
				return {
					backgroundColor: '#000000',
					backgroundImage: `url(${bgValue})`,
					backgroundSize: 'cover',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat'
				};
			case 'solid':
				return { backgroundColor: bgValue || '#000000' };
			default:
				return { backgroundColor: '#000000' };
		}
	})();

	return (
		<div
			id="app-root"
			className="h-screen flex flex-col overflow-hidden"
			style={{ ...bgStyle, position: 'relative', zIndex: 1 }}
		>
			{particles && <SpaceStars />}
			<LiveControls activity={liveActivity} previewUrl={livePreviewUrl} />
			{blockedReason && <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm"><div className="rounded-xl border border-white/10 bg-[#111] px-8 py-7"><p className="text-lg font-medium text-white">{blockedReason}</p><p className="mt-2 text-sm text-white/40">Please try again later.</p></div></div>}
			{runtime.mode === 'unavailable' && (
				<p
					role="alert"
					className="fixed top-0 left-0 right-0 z-50 bg-black p-3 text-white"
				>
					{runtime.error ??
						'Navigation is unavailable. Reload Space to reconnect or retry local startup.'}
				</p>
			)}

			<div
				className="relative flex flex-col h-full"
				style={{ zIndex: 1 }}
			>
				{!isSpecialPage && (
					<>
						<div className="shrink-0" style={{ height: '3rem' }} />
						<TopBar
							sessions={sessions}
							activeSession={activeSession}
							carouselRef={carouselRef}
							proxyReady={proxyReady}
							onNavigate={url =>
								navigateSession(activeSession, url, {
									recordSearch: true
								})
							}
							onBack={handleIframeBack}
							onForward={handleIframeForward}
							onReload={handleIframeReload}
							onHome={() => {
								void navigateSession(activeSession, '');
							}}
							canGoBack={canGoBack}
							canGoForward={canGoForward}
							onLocationChange={handleSessionLocationChange}
							onToggleSavedGame={handleToggleSavedGame}
							canToggleSavedGame={gameLibraryStatus.canToggle}
							isSavedGame={gameLibraryStatus.isSaved}
							onTogglePin={handleTogglePin}
							canTogglePin={canTogglePin}
							isPinned={pinnedState}
						/>
					</>
				)}
				<div className="flex-1 flex overflow-hidden">
					<motion.div
						animate={{
							width: isSpecialPage
								? '4rem'
								: !autoHideSidebar || sidebarHovered
									? '4rem'
									: 0
						}}
						transition={{
							type: 'spring',
							stiffness: 300,
							damping: 30
						}}
						className="shrink-0"
					/>
					<main className="flex-1 relative flex flex-col">
						{renderMainContent()}
					</main>
				</div>
				<Sidebar
					activeItem={activeItem}
					isAdmin={isAdmin}
					onItemClick={handleNavClick}
					onHoverChange={setSidebarHovered}
					sessions={sessions}
					activeSession={activeSession}
					maxSessions={maxSessions}
					onSessionChange={handleSessionSwitch}
					onAddSession={handleAddSession}
					onCloseSession={handleCloseSession}
					alwaysVisible={isSpecialPage || !autoHideSidebar}
				/>
			</div>

			<div className="blobs">
				<div className="blob"></div>
				<div className="blob"></div>
				<div className="blob"></div>
				<div className="blob"></div>
				<div className="blob"></div>
				<div className="blob"></div>
				<div className="blob"></div>
			</div>
		</div>
	);
};

export default App;
