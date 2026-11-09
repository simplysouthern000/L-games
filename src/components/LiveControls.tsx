import { useEffect, useState } from 'react';

type Overlay = { kind: 'banner' | 'jumpscare'; text?: string; imageUrl?: string } | null;

export const LiveControls = ({ activity, previewUrl }: { activity: string; previewUrl?: string }) => {
	const [overlay, setOverlay] = useState<Overlay>(null);

	useEffect(() => {
		const source = new EventSource('/api/events');
		const read = (event: MessageEvent) => {
			try { return JSON.parse(event.data) as Record<string, unknown>; } catch { return {}; }
		};
		const banner = (event: MessageEvent) => {
			const data = read(event); setOverlay({ kind: 'banner', text: typeof data.message === 'string' ? data.message : '' });
			window.setTimeout(() => setOverlay(current => current?.kind === 'banner' ? null : current), 7000);
		};
		const jumpscare = (event: MessageEvent) => {
			const data = read(event); if (typeof data.imageUrl !== 'string') return;
			setOverlay({ kind: 'jumpscare', imageUrl: data.imageUrl });
			window.setTimeout(() => setOverlay(null), 10000);
		};
		source.addEventListener('banner', banner); source.addEventListener('jumpscare', jumpscare);
		source.addEventListener('redirect', event => { const data = read(event); if (typeof data.url === 'string') window.location.assign(data.url); });
		source.addEventListener('kick', () => window.location.assign('/space'));
		source.addEventListener('signout', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.assign('/login.html'); });
		return () => source.close();
	}, []);

	useEffect(() => {
		const update = () => void fetch('/api/session/activity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activity, previewUrl }) });
		update(); const timer = window.setInterval(update, 5000); return () => window.clearInterval(timer);
	}, [activity, previewUrl]);

	if (!overlay) return null;
	if (overlay.kind === 'jumpscare') return <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"><img src={overlay.imageUrl} alt="" className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain shadow-2xl" /></div>;
	return <div className="live-banner fixed left-1/2 top-3 z-[210] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-white/15 bg-[#161616] px-4 py-3 text-center text-sm font-medium text-white shadow-2xl">{overlay.text}</div>;
};
