import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type SiteControls = { maintenanceMode: boolean; gamesDisabled: boolean; proxyDisabled: boolean };
const file = join(process.cwd(), 'data', 'site-controls.json');
const defaults: SiteControls = { maintenanceMode: false, gamesDisabled: false, proxyDisabled: false };

const read = (): SiteControls => {
	try { return { ...defaults, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<SiteControls>) }; } catch { return { ...defaults }; }
};
export const getSiteControls = () => read();
export const updateSiteControls = (next: Partial<SiteControls>) => {
	const controls = { ...read(), ...next };
	mkdirSync(join(process.cwd(), 'data'), { recursive: true });
	writeFileSync(file, JSON.stringify(controls, null, 2));
	return controls;
};
