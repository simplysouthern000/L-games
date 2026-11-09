import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';

const SESSION_COOKIE = 'space_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const USERS_FILE = join(process.cwd(), 'data', 'users.json');

export type SpaceSession = { id: string; username: string; createdAt: number; lastSeen: number; activity: string; previewUrl?: string };
type AttemptState = { count: number; resetAt: number };
type StoredUser = { username: string; salt: string; hash: string; createdAt: number };
const sessions = new Map<string, SpaceSession>();
const attempts = new Map<string, AttemptState>();

const loadLocalEnv = () => {
	try {
		for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
			if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
		}
	} catch {}
};
loadLocalEnv();

const parseCookies = (header: string | undefined) => new Map((header ?? '').split(';').map(part => part.trim().split('=')).filter(([key, value]) => key && value).map(([key, ...value]) => [key, value.join('=')]));
const getClientKey = (request: IncomingMessage) => request.headers['x-forwarded-for']?.toString().split(',')[0].trim() || request.socket.remoteAddress || 'local';
const readUsers = (): StoredUser[] => {
	try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')) as StoredUser[]; } catch { return []; }
};
const writeUsers = (users: StoredUser[]) => { mkdirSync(join(process.cwd(), 'data'), { recursive: true }); writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); };
const hashPassword = (password: string, salt = randomBytes(16).toString('hex')) => ({ salt, hash: scryptSync(password, salt, 64).toString('hex') });
const checkHash = (password: string, salt: string, expectedHash: string) => { const actual = scryptSync(password, salt, 64); const expected = Buffer.from(expectedHash, 'hex'); return expected.length === actual.length && timingSafeEqual(actual, expected); };
const checkPlainPassword = (password: string, expected: string) => { const actual = Buffer.from(password); const configured = Buffer.from(expected); return actual.length === configured.length && timingSafeEqual(actual, configured); };
const isAdminUsername = (username: string) => username === process.env.SPACE_ADMIN_USERNAME;
const credentialsMatch = (username: string, password: string) => {
	const directPassword = process.env.SPACE_ADMIN_PASSWORD;
	if (isAdminUsername(username) && directPassword && checkPlainPassword(password, directPassword)) return true;
	const salt = process.env.SPACE_ADMIN_PASSWORD_SALT;
	const expectedHash = process.env.SPACE_ADMIN_PASSWORD_HASH;
	if (isAdminUsername(username) && salt && expectedHash && checkHash(password, salt, expectedHash)) return true;
	const user = readUsers().find(entry => entry.username === username);
	return Boolean(user && checkHash(password, user.salt, user.hash));
};

export const isLoginRateLimited = (request: IncomingMessage) => {
	const key = getClientKey(request); const state = attempts.get(key);
	if (!state) return false;
	if (state.resetAt <= Date.now()) { attempts.delete(key); return false; }
	return state.count >= MAX_LOGIN_ATTEMPTS;
};
const recordFailedLogin = (request: IncomingMessage) => {
	const key = getClientKey(request); const now = Date.now(); const current = attempts.get(key);
	if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS }); else current.count += 1;
};
export const authenticate = (request: IncomingMessage, username: string, password: string) => {
	if (isLoginRateLimited(request)) return null;
	if (!credentialsMatch(username, password)) { recordFailedLogin(request); return null; }
	attempts.delete(getClientKey(request)); const token = randomBytes(32).toString('hex'); const now = Date.now();
	for (const [oldToken, session] of sessions) if (session.username === username) sessions.delete(oldToken);
	sessions.set(token, { id: randomBytes(12).toString('hex'), username, createdAt: now, lastSeen: now, activity: 'Browsing Space' });
	return token;
};
export const getSessionToken = (request: IncomingMessage) => parseCookies(request.headers.cookie).get(SESSION_COOKIE) ?? null;
export const getSession = (request: IncomingMessage) => {
	const token = getSessionToken(request); if (!token) return null; const session = sessions.get(token);
	if (!session || session.lastSeen + SESSION_TTL_MS <= Date.now()) { sessions.delete(token); return null; }
	return { token, session };
};
export const getAuthenticatedUsername = (request: IncomingMessage) => getSession(request)?.session.username ?? null;
export const isAuthenticatedRequest = (request: IncomingMessage) => getSession(request) !== null;
export const isAdminRequest = (request: IncomingMessage) => getAuthenticatedUsername(request) === process.env.SPACE_ADMIN_USERNAME;
	export const touchSession = (request: IncomingMessage, activity?: string, previewUrl?: string) => {
	const current = getSession(request); if (!current) return null; current.session.lastSeen = Date.now(); if (activity) current.session.activity = activity.slice(0, 120); if (previewUrl !== undefined) current.session.previewUrl = previewUrl.slice(0, 2000); return current.session;
};
export const listActiveSessions = () => Array.from(sessions.values()).filter(session => session.lastSeen + SESSION_TTL_MS > Date.now());
export const findSessionById = (id: string) => Array.from(sessions.entries()).find(([, session]) => session.id === id);
export const removeSessionById = (id: string) => { const found = findSessionById(id); if (!found) return null; sessions.delete(found[0]); return found[1]; };
export const listUsers = () => [
	...(process.env.SPACE_ADMIN_USERNAME ? [{ username: process.env.SPACE_ADMIN_USERNAME, admin: true, createdAt: null }] : []),
	...readUsers().map(user => ({ username: user.username, admin: false, createdAt: user.createdAt }))
];
export const createUser = (username: string, password: string) => {
	const users = readUsers(); if (isAdminUsername(username) || users.some(user => user.username === username)) return false;
	const { salt, hash } = hashPassword(password); users.push({ username, salt, hash, createdAt: Date.now() }); writeUsers(users); return true;
};
export const updateUserPassword = (username: string, password: string) => { const users = readUsers(); const user = users.find(entry => entry.username === username); if (!user) return false; Object.assign(user, hashPassword(password)); writeUsers(users); return true; };
export const deleteUser = (username: string) => {
	if (isAdminUsername(username)) return false; const users = readUsers(); const next = users.filter(user => user.username !== username); if (next.length === users.length) return false; writeUsers(next);
	for (const [token, session] of sessions) if (session.username === username) sessions.delete(token); return true;
};
export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
export const publicAuthPath = (url: string) => { const pathname = url.split('?')[0]; return pathname === '/login.html' || pathname.startsWith('/api/auth/'); };
