import {
	getDefaultPagePath,
	isInternalPage,
	resolveInternalUrl
} from '../utils/internal-pages';

export const defaultSearchTemplate = 'https://search.brave.com/search?q=%s';

/** Raw GitHub serves HTML files as text/plain. Route those game documents
 * through the server so the browser receives a real HTML document. */
export function normalizeGameDocumentUrl(input: string, logicalOrigin: string): string {
	try {
		const url = new URL(input, logicalOrigin + '/');
		if (url.protocol === 'https:' && url.hostname === 'raw.githubusercontent.com' && /\.html?$/i.test(url.pathname)) {
			return `${new URL(logicalOrigin).origin}/api/game-html?url=${encodeURIComponent(url.href)}`;
		}
	} catch {
		/* Let normal navigation validation handle malformed input. */
	}
	return input;
}

/** Decode Scramjet's final URL token without including routing query/hash data. */
export function decodeScramjetUrl(
	value: string,
	prefix: string,
	decoder?: (input: string) => string
): string | null {
	if (typeof decoder !== 'function') return null;
	try {
		const pathname = new URL(value, 'https://space.invalid').pathname;
		if (!pathname.startsWith(prefix)) return null;
		const route = pathname.slice(prefix.length);
		const token = route.slice(route.lastIndexOf('/') + 1);
		return token ? decoder(token) : null;
	} catch {
		return null;
	}
}

/** Address-bar formatting is independent of proxy construction. Schemes are
 * preserved here so the policy rejects them rather than disguising a search. */
export function formatInput(
	input: string,
	template = defaultSearchTemplate
): string {
	const value = input.trim();
	if (!value || /^[a-z][a-z\d+.-]*:/i.test(value) || /^[/.#?]/.test(value))
		return value;
	if (!/\s/.test(value)) {
		try {
			const url = new URL(`http://${value}`);
			if (url.hostname.includes('.')) return url.href;
		} catch {
			/* Non-URL input is a search query. */
		}
	}
	return template.replace('%s', encodeURIComponent(value));
}

export function resolveNavigation(
	input: string,
	logicalOrigin: string
): { kind: 'internal' | 'external'; url: string } {
	const value = input.trim();
	if (!value) return { kind: 'internal', url: getDefaultPagePath() };
	const internal = resolveInternalUrl(value);
	if (internal) return { kind: 'internal', url: internal };
	try {
		const url = new URL(value, logicalOrigin + '/');
		if (
			!['http:', 'https:'].includes(url.protocol) ||
			url.username ||
			url.password
		)
			throw new Error();
		if (
			url.origin === new URL(logicalOrigin).origin &&
			isInternalPage(url.pathname)
		) {
			return {
				kind: 'internal',
				url: url.pathname + url.search + url.hash
			};
		}
		return { kind: 'external', url: url.href };
	} catch {
		// Never include a URL (which may contain credentials) in policy errors.
		throw new Error('Invalid navigation URL');
	}
}
