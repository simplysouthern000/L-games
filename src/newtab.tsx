import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NewTab } from './components/NewTab';
import { initSettings } from './hooks/useLocalStorage';
import './index.css';

const handleNavigate = (url: string) => {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'newtab-navigate', url }, '*');
	}
};

const boot = async () => {
	await initSettings();
	const rootElement = document.getElementById('newtab-root');
	if (rootElement) {
		createRoot(rootElement).render(
			<StrictMode>
				<NewTab onNavigate={handleNavigate} />
			</StrictMode>
		);
	}
};

boot();
