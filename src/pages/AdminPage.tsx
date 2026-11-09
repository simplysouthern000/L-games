import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Send, Trash2, UserRound, X } from 'lucide-react';

type User = { username: string; admin: boolean; root?: boolean };
type LiveSession = { id: string; username: string; activity: string; lastSeen: number };
type SiteControls = { maintenanceMode: boolean; gamesDisabled: boolean; proxyDisabled: boolean };
const request = async (url: string, options?: RequestInit) => {
	const response = await fetch(url, options);
	if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? 'Request failed');
	return response.json();
};

export const AdminPage = () => {
	const [users, setUsers] = useState<User[]>([]);
	const [sessions, setSessions] = useState<LiveSession[]>([]);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [announcement, setAnnouncement] = useState('');
	const [error, setError] = useState('');
	const [controls, setControls] = useState<SiteControls>({ maintenanceMode: false, gamesDisabled: false, proxyDisabled: false });
	const [isRootAdmin, setIsRootAdmin] = useState(false);

	const refresh = async () => {
		try { const [nextUsers, nextSessions, nextControls, auth] = await Promise.all([request('/api/admin/users'), request('/api/admin/sessions'), request('/api/site-controls'), request('/api/auth/status')]); setUsers(nextUsers); setSessions(nextSessions); setControls(nextControls); setIsRootAdmin(auth?.isRootAdmin === true); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load admin data.'); }
	};
	useEffect(() => {
		void refresh();
		const source = new EventSource('/api/admin/events');
		const update = (event: MessageEvent) => { try { setSessions(JSON.parse(event.data)); } catch {} };
		source.addEventListener('sessions', update);
		source.addEventListener('users', () => void refresh());
		return () => source.close();
	}, []);

	const send = async (url: string, body?: unknown) => {
		try { setError(''); await request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed.'); }
	};
	const mutate = async (url: string, method: string, body?: unknown) => {
		try { setError(''); await request(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed.'); }
	};
	const addUser = async (event: FormEvent) => {
		event.preventDefault(); await send('/api/admin/users', { username, password }); setUsername(''); setPassword('');
	};
	const action = (session: LiveSession, name: string, body?: unknown) => void send(`/api/admin/sessions/${session.id}/${name}`, body);
	const updateControls = async (key: keyof SiteControls, value: boolean) => { try { const next = await request('/api/admin/site-controls', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [key]: value }) }); setControls(next); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update site controls.'); } };

	return (
		<div className="h-full overflow-y-auto px-6 pb-20 pt-12 text-white/80 md:px-10">
			<div className="mx-auto max-w-4xl space-y-8">
				<div><h1 className="text-2xl font-semibold text-white">Admin panel</h1><p className="mt-1 text-sm text-white/40">Users and live sessions</p></div>
				{error && <div className="flex items-center justify-between rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"><span>{error}</span><button onClick={() => setError('')}><X className="h-4 w-4" /></button></div>}

				<section className="space-y-3">
					<h2 className="text-sm font-medium text-white">Users</h2>
					<form onSubmit={addUser} className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
						<input value={username} onChange={event => setUsername(event.target.value)} placeholder="Username" className="min-w-32 flex-1 rounded-md bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30" />
						<input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="Password" className="min-w-32 flex-1 rounded-md bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30" />
						<button className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-black"><Plus className="h-4 w-4" />Add user</button>
					</form>
					<div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
						{users.map(user => <div key={user.username} className="flex items-center justify-between gap-3 px-4 py-3"><span className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-white/40" />{user.username}{user.admin && <span className="text-xs text-white/35">{user.root ? 'primary admin' : 'admin'}</span>}</span>{!user.root && <span className="flex flex-wrap justify-end gap-2"><button className="text-xs text-white/45 hover:text-white" onClick={() => { const next = window.prompt('New password (8+ characters)'); if (next) void mutate(`/api/admin/users/${encodeURIComponent(user.username)}`, 'PATCH', { password: next }); }}>Change password</button>{isRootAdmin && <button className="text-xs text-white/45 hover:text-white" onClick={() => void mutate(`/api/admin/users/${encodeURIComponent(user.username)}/role`, 'PATCH', { admin: !user.admin })}>{user.admin ? 'Remove admin' : 'Make admin'}</button>}<button aria-label={`Remove ${user.username}`} className="text-white/40 hover:text-red-300" onClick={() => { if (window.confirm(`Remove ${user.username}?`)) void mutate(`/api/admin/users/${encodeURIComponent(user.username)}`, 'DELETE'); }}><Trash2 className="h-4 w-4" /></button></span>}</div>)}
						{!users.length && <div className="px-4 py-6 text-sm text-white/35">No users yet.</div>}
					</div>
				</section>

				<section className="space-y-3">
					<div className="flex items-center justify-between"><h2 className="text-sm font-medium text-white">Live sessions <span className="text-white/35">({sessions.length})</span></h2></div>
					<div className="space-y-2">
						{sessions.map(session => <div key={session.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm text-white">{session.username}</p><p className="mt-1 truncate text-xs text-white/40">{session.activity}</p></div><div className="flex flex-wrap justify-end gap-2"><button className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10" onClick={() => { const message = window.prompt('Message'); if (message) action(session, 'message', { message }); }}>Message</button><button className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10" onClick={() => { const url = window.prompt('URL'); if (url) action(session, 'redirect', { url }); }}>Redirect</button><button className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10" onClick={() => action(session, 'kick')}>Kick</button><button className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10" onClick={() => action(session, 'signout')}>Sign out</button><button className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10" onClick={() => { const imageUrl = window.prompt('Image URL'); if (imageUrl) action(session, 'jumpscare', { imageUrl }); }}>Popup</button></div></div></div>)}
						{!sessions.length && <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/35">No active sessions.</div>}
					</div>
				</section>

				<section className="flex gap-2"><input value={announcement} onChange={event => setAnnouncement(event.target.value)} placeholder="Global announcement" className="flex-1 rounded-md bg-white/[0.04] px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/30" /><button onClick={() => { if (announcement.trim()) void send('/api/admin/announce', { message: announcement }).then(() => setAnnouncement('')); }} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/10"><Send className="h-4 w-4" />Send</button></section>
				<section className="space-y-3"><h2 className="text-sm font-medium text-white">Site controls</h2>{(['maintenanceMode', 'gamesDisabled', 'proxyDisabled'] as const).map(key => <label key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"><span>{key === 'maintenanceMode' ? 'Maintenance mode' : key === 'gamesDisabled' ? 'Disable games' : 'Disable proxy'}</span><input type="checkbox" checked={controls[key]} onChange={event => void updateControls(key, event.target.checked)} /></label>)}</section>
			</div>
		</div>
	);
};
