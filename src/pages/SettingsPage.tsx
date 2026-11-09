import {
	useState,
	useRef,
	useCallback,
	useEffect,
	type ReactNode
} from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
	EyeOff,
	Gauge,
	Globe,
	ChevronDown,
	Palette,
	Info,
	Upload,
	Link,
	X
} from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { writeSetting } from '../hooks/useLocalStorage';
import { useClickOutside } from '../hooks/useClickOutside';
import { launchAboutBlank, launchBlob, normalizeUrl } from '../lib/cloak';
import bgPresets from '../json/backgrounds.json';
import { apiAvailability } from '../runtime/api';
import { normalizeProxyDisplay } from '../runtime/proxy-settings';
import { hexToHsv, hsvToHex, type HsvColor } from '../runtime/accent-color';

const spring = { type: 'spring' as const, stiffness: 300, damping: 28 };
const soft = { type: 'spring' as const, stiffness: 200, damping: 22 };

const tabs = [
	{ id: 'cloak', label: 'Cloaking', icon: EyeOff },
	{ id: 'appear', label: 'Appearance', icon: Palette },
	{ id: 'perf', label: 'Performance', icon: Gauge },
	{ id: 'proxy', label: 'Proxy', icon: Globe },
	{ id: 'about', label: 'About', icon: Info }
];

const Toggle = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
	<motion.button
		whileTap={{ scale: 0.9 }}
		onClick={() => set(!on)}
		className="relative w-12 h-7 rounded-full cursor-pointer shrink-0"
		animate={{
			backgroundColor: on
				? 'var(--color-primary)'
				: 'var(--color-surface-light)'
		}}
		transition={spring}
	>
		<motion.div
			className="absolute top-0.75 left-0.75 w-5 h-5 rounded-full bg-white/90"
			animate={{ x: on ? 20 : 0 }}
			transition={spring}
		/>
	</motion.button>
);

const Select = ({
	value,
	options,
	onChange
}: {
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) => {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const wrapperRef = useClickOutside<HTMLDivElement>(
		useCallback(() => setOpen(false), [])
	);

	const [dropUp, setDropUp] = useState(false);

	useEffect(() => {
		const id = requestAnimationFrame(() => {
			if (!open || !triggerRef.current) {
				setDropUp(false);
				return;
			}
			const rect = triggerRef.current.getBoundingClientRect();
			const spaceBelow = window.innerHeight - rect.bottom;
			const estimatedHeight = options.length * 44 + 16;
			setDropUp(spaceBelow < estimatedHeight && rect.top > spaceBelow);
		});
		return () => cancelAnimationFrame(id);
	}, [open, options.length]);

	return (
		<div ref={wrapperRef} className="relative shrink-0 exception">
			<motion.button
				ref={triggerRef}
				whileTap={{ scale: 0.97 }}
				onClick={() => setOpen(o => !o)}
				className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm text-white/50 cursor-pointer"
				style={{
					background: 'rgba(255,255,255,0.04)',
					border: '1px solid rgba(255,255,255,0.07)'
				}}
			>
				{value}
				<motion.span
					animate={{ rotate: open ? 180 : 0 }}
					transition={{ duration: 0.15 }}
				>
					<ChevronDown className="w-4 h-4 text-white/25" />
				</motion.span>
			</motion.button>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{
							opacity: 0,
							scale: 0.95,
							y: dropUp ? 4 : -4
						}}
						animate={{
							opacity: 1,
							scale: 1,
							y: dropUp ? -6 : 6
						}}
						exit={{
							opacity: 0,
							scale: 0.95,
							y: dropUp ? 4 : -4
						}}
						transition={{ duration: 0.15 }}
						className="absolute z-50 right-0 min-w-50 rounded-2xl overflow-hidden"
						style={{
							...(dropUp ? { bottom: '100%' } : { top: '100%' }),
							background: 'var(--color-surface)',
							border: '1px solid var(--color-border)'
						}}
					>
						{options.map((o, i) => {
							const isFirst = i === 0;
							const isLast = i === options.length - 1;
							return (
								<button
									key={o}
									onClick={() => {
										onChange(o);
										setOpen(false);
									}}
									className="block w-full text-left px-5 text-sm cursor-pointer transition-colors"
									style={{
										paddingTop: isFirst
											? '1rem'
											: '0.75rem',
										paddingBottom: isLast
											? '1rem'
											: '0.75rem',
										color:
											o === value
												? 'var(--color-primary-light)'
												: 'rgba(255,255,255,0.4)',
										backgroundColor:
											o === value
												? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
												: 'transparent'
									}}
									onMouseEnter={e => {
										if (o !== value)
											(
												e.target as HTMLElement
											).style.backgroundColor =
												'rgba(255,255,255,0.03)';
									}}
									onMouseLeave={e => {
										if (o !== value)
											(
												e.target as HTMLElement
											).style.backgroundColor =
												'transparent';
									}}
								>
									{o}
								</button>
							);
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

const Btn = ({
	children,
	onClick,
	variant = 'primary'
}: {
	children: ReactNode;
	onClick?: () => void;
	variant?: 'primary' | 'ghost';
}) => (
	<motion.button
		whileHover={{ scale: 1.04 }}
		whileTap={{ scale: 0.96 }}
		onClick={onClick}
		className="px-6 py-2.5 rounded-xl text-sm font-semibold cursor-pointer shrink-0"
		style={
			variant === 'ghost'
				? {
						background: 'var(--color-surface)',
						border: '1px solid var(--color-border)',
						color: 'rgba(255,255,255,0.45)'
					}
				: {
						background: 'var(--color-primary)',
						border: '1px solid var(--color-primary)',
						color: '#ffffff'
					}
		}
	>
		{children}
	</motion.button>
);

const Section = ({
	title,
	children,
	delay = 0
}: {
	title: string;
	children: ReactNode;
	delay?: number;
}) => (
	<motion.section
		initial={{ opacity: 0, y: 20 }}
		animate={{ opacity: 1, y: 0 }}
		transition={{ ...soft, delay }}
	>
		<h3 className="text-xs font-semibold uppercase tracking-widest text-white/20 mb-5 pl-1">
			{title}
		</h3>
		<div
			className="rounded-2xl divide-y divide-white/4"
			style={{
				background: 'var(--color-surface)',
				border: '1px solid var(--color-border)'
			}}
		>
			{children}
		</div>
	</motion.section>
);

const Row = ({
	label,
	desc,
	children
}: {
	label: string;
	desc?: string;
	children: ReactNode;
}) => (
	<div className="flex items-center justify-between px-8 py-6 group transition-colors duration-150 hover:bg-white/2 rounded-xl">
		<div className="flex flex-col gap-1 mr-8 min-w-0">
			<span className="text-[15px] text-white/75 font-medium group-hover:text-white/90 transition-colors duration-150">
				{label}
			</span>
			{desc && (
				<span className="text-sm text-white/25 leading-relaxed">
					{desc}
				</span>
			)}
		</div>
		{children}
	</div>
);

const urlRe = /^(https?:\/\/)?[^\s/$.?#].[^\s]*\.[^\s]{2,}$/i;

const CustomCloakInputs = () => {
	const [faviconUrl, setFaviconUrl] = useLocalStorage(
		'customCloakFavicon',
		''
	);
	const [titleInput, setTitleInput] = useLocalStorage('customCloakTitle', '');
	const [localFavicon, setLocalFavicon] = useState(faviconUrl);
	const [localTitle, setLocalTitle] = useState(titleInput);
	const [faviconSaved, setFaviconSaved] = useState(false);
	const [titleSaved, setTitleSaved] = useState(false);
	const faviconTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const titleTimer = useRef<ReturnType<typeof setTimeout>>(null);

	const commitFavicon = useCallback(
		(val: string) => {
			setFaviconUrl(val);
			setFaviconSaved(true);
			setTimeout(() => setFaviconSaved(false), 1200);
		},
		[setFaviconUrl]
	);

	const commitTitle = useCallback(
		(val: string) => {
			setTitleInput(val);
			setTitleSaved(true);
			setTimeout(() => setTitleSaved(false), 1200);
		},
		[setTitleInput]
	);

	const handleFaviconChange = (val: string) => {
		setLocalFavicon(val);
		if (faviconTimer.current) clearTimeout(faviconTimer.current);
		faviconTimer.current = setTimeout(() => commitFavicon(val), 1500);
	};

	const handleTitleChange = (val: string) => {
		setLocalTitle(val);
		if (titleTimer.current) clearTimeout(titleTimer.current);
		titleTimer.current = setTimeout(() => commitTitle(val), 1500);
	};

	useEffect(() => {
		return () => {
			if (faviconTimer.current) clearTimeout(faviconTimer.current);
			if (titleTimer.current) clearTimeout(titleTimer.current);
		};
	}, []);

	const faviconPreview =
		localFavicon && urlRe.test(localFavicon)
			? normalizeUrl(localFavicon)
			: null;

	const resolvedTitle = urlRe.test(localTitle)
		? (() => {
				try {
					return new URL(normalizeUrl(localTitle)).hostname;
				} catch {
					return localTitle;
				}
			})()
		: localTitle;

	const inputStyle = {
		background: 'rgba(255,255,255,0.03)',
		border: '1px solid rgba(255,255,255,0.07)',
		color: 'rgba(255,255,255,0.7)'
	};

	const inputFocusStyle = {
		border: '1px solid var(--color-primary)'
	};

	return (
		<motion.div
			initial={{ height: 0, opacity: 0 }}
			animate={{ height: 'auto', opacity: 1 }}
			exit={{ height: 0, opacity: 0 }}
			transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
			className="overflow-hidden"
		>
			<div className="px-8 pb-6 pt-2 flex flex-col gap-4">
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.08, duration: 0.2 }}
				>
					<div className="flex items-center gap-3 mb-2">
						<label className="text-xs font-medium text-white/30 uppercase tracking-wider">
							Favicon Source URL (Auto Title)
						</label>
						<AnimatePresence>
							{faviconSaved && (
								<motion.span
									initial={{ opacity: 0, x: -6 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -6 }}
									className="text-xs"
									style={{
										color: 'var(--color-primary-light)'
									}}
								>
									Saved
								</motion.span>
							)}
						</AnimatePresence>
					</div>
					<div className="flex items-center gap-3">
						<div className="relative flex-1">
							<input
								type="text"
								value={localFavicon}
								onChange={e =>
									handleFaviconChange(e.target.value)
								}
								placeholder="https://google.com"
								spellCheck={false}
								className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 placeholder:text-white/15"
								style={inputStyle}
								onFocus={e =>
									Object.assign(
										e.target.style,
										inputFocusStyle
									)
								}
								onBlur={e =>
									Object.assign(e.target.style, inputStyle)
								}
							/>
						</div>
						<AnimatePresence>
							{faviconPreview && (
								<motion.div
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.15 }}
									className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
									style={{
										background: 'rgba(255,255,255,0.04)',
										border: '1px solid rgba(255,255,255,0.06)'
									}}
								>
									<img
										src={faviconPreview}
										alt=""
										className="w-4 h-4"
										onError={e => {
											const img =
												e.target as HTMLImageElement;
											try {
												const fallback =
													new URL(faviconPreview)
														.origin +
													'/favicon.ico';
												if (img.src !== fallback) {
													img.src = fallback;
													return;
												}
											} catch {
												console.log(e);
											}
										}}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.16, duration: 0.2 }}
				>
					<div className="flex items-center gap-3 mb-2">
						<label className="text-xs font-medium text-white/30 uppercase tracking-wider">
							Tab Title (Auto Title Override)
						</label>
						<AnimatePresence>
							{titleSaved && (
								<motion.span
									initial={{ opacity: 0, x: -6 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -6 }}
									className="text-xs"
									style={{
										color: 'var(--color-primary-light)'
									}}
								>
									Saved
								</motion.span>
							)}
						</AnimatePresence>
					</div>
					<input
						type="text"
						value={localTitle}
						onChange={e => handleTitleChange(e.target.value)}
						placeholder="Title or URL"
						spellCheck={false}
						className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 placeholder:text-white/15"
						style={inputStyle}
						onFocus={e =>
							Object.assign(e.target.style, inputFocusStyle)
						}
						onBlur={e => Object.assign(e.target.style, inputStyle)}
					/>
					<AnimatePresence>
						{resolvedTitle && localTitle && (
							<motion.p
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: 'auto' }}
								exit={{ opacity: 0, height: 0 }}
								className="text-xs text-white/20 mt-2 pl-1"
							>
								Preview:{' '}
								<span className="text-white/40">
									{resolvedTitle}
								</span>
							</motion.p>
						)}
					</AnimatePresence>
				</motion.div>
			</div>
		</motion.div>
	);
};

const CloakPanel = () => {
	const [autoBlank, setAutoBlank] = useLocalStorage('autoAboutBlank', false);
	const [autoBlob, setAutoBlob] = useLocalStorage('autoBlob', false);
	const [tabCloak, setTabCloak] = useLocalStorage('tabCloak', 'None');
	return (
		<div className="flex flex-col gap-12">
			<Section title="Quick Actions" delay={0.0}>
				<Row
					label="About:Blank"
					desc="Open site inside a hidden blank tab"
				>
					<Btn onClick={() => launchAboutBlank(tabCloak)}>Launch</Btn>
				</Row>
				<Row label="Blob Cloak" desc="Use a temporary blob URL to hide">
					<Btn variant="ghost" onClick={() => launchBlob(tabCloak)}>
						Launch
					</Btn>
				</Row>
			</Section>

			<Section title="Automatic Cloaking" delay={0.06}>
				<Row
					label="Auto About:Blank"
					desc="Cloak automatically when the page loads"
				>
					<Toggle
						on={autoBlank}
						set={v => {
							setAutoBlank(v);
							if (v) setAutoBlob(false);
						}}
					/>
				</Row>
				<Row
					label="Auto Blob"
					desc="Use blob cloaking automatically on load"
				>
					<Toggle
						on={autoBlob}
						set={v => {
							setAutoBlob(v);
							if (v) setAutoBlank(false);
						}}
					/>
				</Row>
			</Section>

			<Section title="Tab Disguise" delay={0.12}>
				<Row
					label="Disguise Preset"
					desc="Change tab title and favicon to look like another site"
				>
					<Select
						value={tabCloak}
						options={[
							'None',
							'Desmos',
							'Google Classroom',
							'Google Drive',
							'Khan Academy',
							'Custom'
						]}
						onChange={setTabCloak}
					/>
				</Row>
				<AnimatePresence>
					{tabCloak === 'Custom' && <CustomCloakInputs />}
				</AnimatePresence>
			</Section>
		</div>
	);
};

const presetColors = [
	'#000000',
	'#0a0a1a',
	'#1a0a2e',
	'#0d1117',
	'#1c1c1c',
	'#2d1b69',
	'#1a1a2e',
	'#16213e',
	'#0f3460',
	'#533483'
];

const AccentColorControl = () => {
	const [themeColor, setThemeColor] = useLocalStorage(
		'themeColor',
		'#0045ff'
	);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(themeColor));
	const closePicker = useCallback(() => setPickerOpen(false), []);
	const pickerRef = useClickOutside<HTMLDivElement>(closePicker);

	useEffect(() => setHsv(hexToHsv(themeColor)), [themeColor]);

	const setColor = (color: string) => {
		setThemeColor(color);
		setHsv(hexToHsv(color));
	};

	const setColorFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		const saturation = Math.min(
			1,
			Math.max(0, (event.clientX - bounds.left) / bounds.width)
		);
		const value =
			1 -
			Math.min(
				1,
				Math.max(0, (event.clientY - bounds.top) / bounds.height)
			);
		const next = { ...hsv, saturation, value };
		setHsv(next);
		setThemeColor(hsvToHex(next));
	};

	const setHue = (hue: number) => {
		const next = { ...hsv, hue };
		setHsv(next);
		setThemeColor(hsvToHex(next));
	};

	return (
		<div className="flex items-center gap-2.5">
			{['#0045ff', '#8b5cf6', '#ec4899', '#06b6d4', '#22c55e', '#f59e0b'].map(
				color => (
					<button
						key={color}
						type="button"
						aria-label={`Set accent color ${color}`}
						aria-pressed={themeColor.toLowerCase() === color}
						onClick={() => setColor(color)}
						className="w-7 h-7 rounded-full cursor-pointer ring-2 ring-transparent hover:ring-white/20 transition-all duration-150"
						style={{
							background: color,
							outline:
								themeColor.toLowerCase() === color
									? '2px solid white'
									: undefined
						}}
					/>
				)
			)}
			<div ref={pickerRef} className="relative">
				<button
					type="button"
					aria-label="Choose custom accent color"
					aria-expanded={pickerOpen}
					onClick={() => setPickerOpen(open => !open)}
					className="w-7 h-7 rounded-full cursor-pointer border-2 border-white/40"
					style={{ background: themeColor }}
				/>
				{pickerOpen && (
					<div
						className="absolute right-0 top-10 z-50 w-60 rounded-2xl p-4 shadow-2xl"
						style={{
							background: 'var(--color-surface)',
							border: '1px solid var(--color-border)'
						}}
					>
						<div
							role="slider"
							aria-label="Accent saturation and brightness"
							aria-valuetext={`${Math.round(hsv.saturation * 100)}% saturation, ${Math.round(hsv.value * 100)}% brightness`}
							tabIndex={0}
							onPointerDown={event => {
								event.currentTarget.setPointerCapture(
									event.pointerId
								);
								setColorFromPointer(event);
							}}
							onPointerMove={event => {
								if (
									event.currentTarget.hasPointerCapture(
										event.pointerId
									)
								)
									setColorFromPointer(event);
							}}
							onKeyDown={event => {
								const step = event.shiftKey ? 0.1 : 0.02;
								const next = { ...hsv };
								if (event.key === 'ArrowLeft')
									next.saturation = Math.max(
										0,
										next.saturation - step
									);
								else if (event.key === 'ArrowRight')
									next.saturation = Math.min(
										1,
										next.saturation + step
									);
								else if (event.key === 'ArrowUp')
									next.value = Math.min(1, next.value + step);
								else if (event.key === 'ArrowDown')
									next.value = Math.max(0, next.value - step);
								else return;
								event.preventDefault();
								setHsv(next);
								setThemeColor(hsvToHex(next));
							}}
							className="relative h-36 w-full rounded-lg cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-white"
							style={{
								background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.hue} 100% 50%))`
							}}
						>
							<span
								className="absolute w-3.5 h-3.5 -ml-1.75 -mt-1.75 rounded-full border-2 border-white shadow"
								style={{
									left: `${hsv.saturation * 100}%`,
									top: `${(1 - hsv.value) * 100}%`
								}}
							/>
						</div>
						<label className="mt-4 flex items-center gap-3 text-xs text-white/50">
							Hue
							<input
								aria-label="Accent hue"
								type="range"
								min="0"
								max="359"
								value={Math.round(hsv.hue) % 360}
								onChange={event =>
									setHue(Number(event.target.value))
								}
								className="min-w-0 flex-1"
								style={{
									background:
										'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
								}}
							/>
						</label>
						<div className="mt-3 flex items-center gap-2">
							<span
								className="w-5 h-5 rounded-full border border-white/20"
								style={{ background: themeColor }}
							/>
							<output className="text-xs text-white/50 font-mono uppercase">
								{themeColor}
							</output>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

const BackgroundSelector = () => {
	const [bgMode, setBgMode] = useLocalStorage('bgMode', 'solid');
	const [bgValue, setBgValue] = useLocalStorage('bgValue', '#000000');
	const [urlInput, setUrlInput] = useState('');
	const [urlSaved, setUrlSaved] = useState(false);
	const urlTimer = useRef<ReturnType<typeof setTimeout>>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const commitUrl = useCallback(
		(val: string) => {
			const normalized = /^https?:\/\//i.test(val)
				? val
				: `https://${val}`;
			setBgMode('image');
			setBgValue(normalized);
			setUrlSaved(true);
			setTimeout(() => setUrlSaved(false), 1200);
		},
		[setBgMode, setBgValue]
	);

	const handleUrlChange = (val: string) => {
		setUrlInput(val);
		if (urlTimer.current) clearTimeout(urlTimer.current);
		urlTimer.current = setTimeout(() => {
			if (val.trim()) commitUrl(val.trim());
		}, 1500);
	};

	useEffect(() => {
		return () => {
			if (urlTimer.current) clearTimeout(urlTimer.current);
		};
	}, []);

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			setBgMode('image');
			setBgValue(result);
		};
		reader.readAsDataURL(file);
	};

	const inputStyle = {
		background: 'rgba(255,255,255,0.03)',
		border: '1px solid rgba(255,255,255,0.07)',
		color: 'rgba(255,255,255,0.7)'
	};

	const inputFocusStyle = {
		border: '1px solid var(--color-primary)'
	};

	return (
		<motion.div
			initial={{ height: 0, opacity: 0 }}
			animate={{ height: 'auto', opacity: 1 }}
			exit={{ height: 0, opacity: 0 }}
			transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
			className="overflow-hidden"
		>
			<div className="px-8 pb-6 pt-2 flex flex-col gap-5">
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.06, duration: 0.2 }}
				>
					<label className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3 block">
						Solid Colors
					</label>
					<div className="flex flex-wrap gap-2.5">
						{presetColors.map(c => (
							<button
								key={c}
								onClick={() => {
									setBgMode('solid');
									setBgValue(c);
								}}
								className="w-9 h-9 rounded-xl cursor-pointer transition-all duration-150 shrink-0"
								style={{
									background: c,
									border:
										bgMode === 'solid' && bgValue === c
											? '2px solid color-mix(in srgb, var(--color-primary) 60%, transparent)'
											: '2px solid rgba(255,255,255,0.06)'
								}}
							/>
						))}
						<div className="relative w-9 h-9 shrink-0">
							<input
								type="color"
								value={bgMode === 'solid' ? bgValue : '#000000'}
								onChange={e => {
									setBgMode('solid');
									setBgValue(e.target.value);
								}}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<div
								className="w-full h-full rounded-xl pointer-events-none"
								style={{
									background:
										'conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
									border: '2px solid rgba(255,255,255,0.06)'
								}}
							/>
						</div>
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.12, duration: 0.2 }}
				>
					<label className="text-xs font-medium text-white/30 uppercase tracking-wider mb-3 block">
						Preset Images
					</label>
					<div className="flex gap-3 overflow-x-auto pb-2">
						{bgPresets.map(bg => (
							<button
								key={bg.id}
								onClick={() => {
									setBgMode('image');
									setBgValue(bg.url);
								}}
								className="shrink-0 w-24 h-16 rounded-xl cursor-pointer overflow-hidden transition-all duration-150 relative group"
								style={{
									border:
										bgMode === 'image' && bgValue === bg.url
											? '2px solid color-mix(in srgb, var(--color-primary) 60%, transparent)'
											: '2px solid rgba(255,255,255,0.06)'
								}}
							>
								<img
									src={bg.thumb}
									alt={bg.label}
									className="w-full h-full object-cover"
									loading="lazy"
								/>
								<span className="absolute inset-x-0 bottom-0 text-[9px] text-white/70 bg-black/50 px-1.5 py-0.5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
									{bg.label}
								</span>
							</button>
						))}
					</div>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.18, duration: 0.2 }}
				>
					<div className="flex items-center gap-3 mb-2">
						<label className="text-xs font-medium text-white/30 uppercase tracking-wider">
							Image URL
						</label>
						<AnimatePresence>
							{urlSaved && (
								<motion.span
									initial={{ opacity: 0, x: -6 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -6 }}
									className="text-xs"
									style={{
										color: 'var(--color-primary-light)'
									}}
								>
									Saved
								</motion.span>
							)}
						</AnimatePresence>
					</div>
					<div className="flex items-center gap-3">
						<div className="relative flex-1">
							<Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20 pointer-events-none" />
							<input
								type="text"
								value={urlInput}
								onChange={e => handleUrlChange(e.target.value)}
								placeholder="https://example.com/bg.jpg"
								spellCheck={false}
								className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-150 placeholder:text-white/15"
								style={inputStyle}
								onFocus={e =>
									Object.assign(
										e.target.style,
										inputFocusStyle
									)
								}
								onBlur={e =>
									Object.assign(e.target.style, inputStyle)
								}
							/>
						</div>
						<motion.button
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.95 }}
							onClick={() => fileRef.current?.click()}
							className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm cursor-pointer shrink-0"
							style={{
								background: 'rgba(255,255,255,0.04)',
								border: '1px solid rgba(255,255,255,0.07)',
								color: 'rgba(255,255,255,0.45)'
							}}
						>
							<Upload className="w-3.5 h-3.5" />
							Upload
						</motion.button>
						<input
							ref={fileRef}
							type="file"
							accept="image/*"
							onChange={handleFileUpload}
							className="hidden"
						/>
					</div>
				</motion.div>

				<AnimatePresence>
					{bgMode === 'image' && bgValue && (
						<motion.div
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.2 }}
						>
							<div className="flex items-center gap-3">
								<div
									className="w-16 h-10 rounded-lg overflow-hidden shrink-0"
									style={{
										border: '1px solid rgba(255,255,255,0.06)'
									}}
								>
									<img
										src={bgValue}
										alt=""
										className="w-full h-full object-cover"
										onError={e =>
											((
												e.target as HTMLImageElement
											).style.display = 'none')
										}
									/>
								</div>
								<span className="text-xs text-white/25 truncate flex-1 min-w-0">
									{bgValue.startsWith('data:')
										? 'Uploaded image'
										: bgValue}
								</span>
								<motion.button
									whileHover={{ scale: 1.05 }}
									whileTap={{ scale: 0.9 }}
									onClick={() => {
										setBgMode('solid');
										setBgValue('#000000');
									}}
									className="p-1.5 rounded-lg cursor-pointer text-white/25 hover:text-white/50 transition-colors"
								>
									<X className="w-3.5 h-3.5" />
								</motion.button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</motion.div>
	);
};

const AppearPanel = () => {
	const [particles, setParticles] = useLocalStorage('particles', true);
	const [autoHideSidebar, setAutoHideSidebar] = useLocalStorage(
		'autoHideSidebar',
		false
	);
	const [clock12h, setClock12h] = useLocalStorage('clock12h', false);
	const [clockLock, setClockLock] = useLocalStorage('clockLock', false);

	return (
		<div className="flex flex-col gap-12">
			<Section title="Layout" delay={0.0}>
				<Row
					label="Auto-hide Sidebar"
					desc="Sidebar slides away when not hovered"
				>
					<Toggle on={autoHideSidebar} set={setAutoHideSidebar} />
				</Row>
			</Section>

			<Section title="New Tab" delay={0.03}>
				<Row
					label="12-Hour Clock"
					desc="Show time in 12-hour format with AM/PM"
				>
					<Toggle on={clock12h} set={setClock12h} />
				</Row>
				<Row
					label="Lock Clock Format"
					desc="Disable clicking the clock to switch format"
				>
					<Toggle on={clockLock} set={setClockLock} />
				</Row>
			</Section>

			<Section title="Background" delay={0.06}>
				<Row
					label="Starfield Particles"
					desc="Animated star background, turn off to pick an image or color"
				>
					<Toggle on={particles} set={setParticles} />
				</Row>
				<AnimatePresence>
					{!particles && <BackgroundSelector />}
				</AnimatePresence>
			</Section>

			<Section title="Theme" delay={0.12}>
				<Row
					label="Accent Color"
					desc="Primary color used across the UI"
				>
					<AccentColorControl />
				</Row>
			</Section>
		</div>
	);
};

const PerfPanel = () => {
	const [, setParticles] = useLocalStorage('particles', true);
	const [reduceMotion, setReduceMotion] = useLocalStorage(
		'reduceMotion',
		false
	);
	const [autoCapSessions, setAutoCapSessions] = useLocalStorage(
		'autoCapSessions',
		true
	);
	return (
		<div className="flex flex-col gap-12">
			<Section title="Rendering" delay={0.0}>
				<Row
					label="Reduce Animations"
					desc="Disable starfield, transitions, and effects for low-end devices"
				>
					<Toggle
						on={reduceMotion}
						set={v => {
							setReduceMotion(v);
							if (v) setParticles(false);
						}}
					/>
				</Row>
			</Section>

			<Section title="Sessions" delay={0.03}>
				<Row
					label="Auto-cap Sessions"
					desc="Limit max open sessions based on your screen size"
				>
					<Toggle on={autoCapSessions} set={setAutoCapSessions} />
				</Row>
			</Section>
		</div>
	);
};

const proxyKeyMap: Record<string, string> = {
	Scramjet: 'sj'
};

const transportKeyMap: Record<string, string> = {
	Libcurl: 'libcurl',
	Epoxy: 'epoxy'
};

const searchEngineUrls: Record<string, string> = {
	Brave: 'https://search.brave.com/search?q=%s',
	DuckDuckGo: 'https://www.duckduckgo.com/?q=%s',
	Google: 'https://www.google.com/search?q=%s',
	Bing: 'https://www.bing.com/search?q=%s',
	'Yahoo!': 'https://search.yahoo.com/search?p=%s'
};

const ProxyPanel = () => {
	const [proxy, setProxy] = useLocalStorage('proxyDisplay', 'Scramjet');
	const [transport, setTransport] = useLocalStorage(
		'transportDisplay',
		'Libcurl'
	);
	const [engine, setEngine] = useLocalStorage('searchEngine', 'Brave');
	const proxyDisplay = normalizeProxyDisplay(proxy);

	useEffect(() => {
		if (proxy !== proxyDisplay) {
			setProxy(proxyDisplay);
		}
	}, [proxy, proxyDisplay, setProxy]);

	const handleProxyChange = (v: string) => {
		if (window.proxy?.mode !== 'standalone') return;
		const display = normalizeProxyDisplay(v);
		setProxy(display);
		const mapped = proxyKeyMap[display];
		if (mapped) {
			writeSetting('proxy', mapped);
			if (window.proxy.local) window.proxy.local.proxySetting = mapped;
		}
	};

	const handleTransportChange = (v: string) => {
		if (window.proxy?.mode !== 'standalone') return;
		setTransport(v);
		const mapped = transportKeyMap[v];
		if (mapped) {
			writeSetting('transports', mapped);
			if (window.proxy.local) {
				window.proxy.local.transportVar = mapped;
				void window.proxy.local.setTransports();
			}
		}
	};

	const handleEngineChange = (v: string) => {
		setEngine(v);
		const url = searchEngineUrls[v];
		if (url) {
			writeSetting('search', url);
		}
	};

	return (
		<div className="flex flex-col gap-12">
			{window.proxy?.mode === 'standalone' ? (
				<Section title="Backend" delay={0.0}>
					<Row
						label="Proxy Backend"
						desc="The core proxy engine powering your sessions"
					>
						<Select
							value={proxyDisplay}
							options={['Scramjet']}
							onChange={handleProxyChange}
						/>
					</Row>
					<Row
						label="Transport"
						desc="Network transport layer for data transfer"
					>
						<Select
							value={transport}
							options={['Libcurl', 'Epoxy']}
							onChange={handleTransportChange}
						/>
					</Row>
				</Section>
			) : (
				<p>
					Navigation is handled by the surrounding proxy. Local proxy
					and transport controls are unavailable; reload to reconnect
					if the session is lost.
				</p>
			)}

			<Section title="Search" delay={0.06}>
				<Row
					label="Search Engine"
					desc="Default search provider for the address bar"
				>
					<Select
						value={engine}
						options={[
							'Brave',
							'DuckDuckGo',
							'Google',
							'Bing',
							'Yahoo!'
						]}
						onChange={handleEngineChange}
					/>
				</Row>
			</Section>
		</div>
	);
};

const AboutPanel = () => {
	const [reportOpen, setReportOpen] = useState(false);
	const [kind, setKind] = useState<'bug' | 'suggestion'>('bug');
	const [message, setMessage] = useState('');
	const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

	const closeReport = () => {
		if (status !== 'sending') {
			setReportOpen(false);
			setStatus('idle');
		}
	};

	const submitReport = async () => {
		if (message.trim().length < 3) return;
		setStatus('sending');
		try {
			const response = await fetch('/api/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind,
					message,
					page: window.location.pathname
				})
			});
			if (!response.ok) throw new Error('Report failed');
			setStatus('sent');
			setMessage('');
		} catch {
			setStatus('error');
		}
	};

	return (
		<>
			<div className="flex flex-col gap-12">
				<Section title="Application" delay={0.0}>
					<Row label="Version" desc="Current build version">
						<span className="text-sm text-white/30 font-mono">2.0.0</span>
					</Row>
					<Row label="Framework" desc="Technologies used">
						<span className="text-sm text-white/30">React + Vite</span>
					</Row>
				</Section>

				<Section title="Links" delay={0.06}>
					<Row label="Report a Bug" desc="Submit a bug report or suggestion">
						<Btn variant="ghost" onClick={() => setReportOpen(true)}>Open</Btn>
					</Row>
				</Section>

				<Section title="Credits" delay={0.12}>
					<Row
						label="Game sources"
						desc="Libraries contributing to the active game catalog"
					>
						<ul className="text-sm text-white/50" aria-label="Game-source credits">
							{['Truffled', 'gn-math', 'Selenite', 'Velara'].map(name => (
								<li key={name}>{name}</li>
							))}
						</ul>
					</Row>
				</Section>
			</div>

			<AnimatePresence>
				{reportOpen && (
					<motion.div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-6"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onMouseDown={event => {
							if (event.target === event.currentTarget) closeReport();
						}}
					>
						<motion.div
							role="dialog"
							aria-modal="true"
							aria-labelledby="feedback-title"
							className="w-full max-w-lg rounded-2xl p-6"
							style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
							initial={{ opacity: 0, y: 12, scale: 0.98 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 8, scale: 0.98 }}
						>
							<div className="flex items-start justify-between gap-4">
								<div>
									<h2 id="feedback-title" className="text-xl font-semibold text-white/90">Report or suggest</h2>
									<p className="mt-1 text-sm text-white/35">Tell us what you would like improved.</p>
								</div>
								<button type="button" aria-label="Close feedback dialog" onClick={closeReport} className="rounded-lg p-2 text-white/35 hover:bg-white/5 hover:text-white/80">
									<X className="h-5 w-5" />
								</button>
							</div>

							<div className="mt-6 flex gap-2">
								{([['bug', 'Bug report'], ['suggestion', 'Suggestion']] as const).map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => setKind(value)}
										className="rounded-lg px-3 py-2 text-sm transition-colors"
										style={{
											color: kind === value ? '#fff' : 'rgba(255,255,255,0.45)',
											background: kind === value ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)' : 'rgba(255,255,255,0.04)',
											border: `1px solid ${kind === value ? 'var(--color-primary)' : 'var(--color-border)'}`
										}}
									>
										{label}
									</button>
								))}
							</div>

							<label className="mt-4 block text-sm text-white/55" htmlFor="feedback-message">What would you like to report or suggest?</label>
							<textarea
								id="feedback-message"
								value={message}
								onChange={event => setMessage(event.target.value)}
								maxLength={2000}
								rows={6}
								placeholder="Describe the issue or idea..."
								className="mt-2 w-full resize-y rounded-xl p-3 text-sm text-white/80 outline-none placeholder:text-white/25"
								style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
							/>

							<div className="mt-2 flex items-center justify-between text-xs text-white/30">
								<span>{message.length}/2000</span>
								{status === 'error' && <span className="text-red-300">Could not send. Try again.</span>}
								{status === 'sent' && <span className="text-emerald-300">Thanks — sent successfully.</span>}
							</div>

							<div className="mt-6 flex justify-end gap-3">
								<Btn variant="ghost" onClick={closeReport}>Cancel</Btn>
								<Btn onClick={() => void submitReport()}>{status === 'sending' ? 'Sending…' : 'Send feedback'}</Btn>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
};

const panels: Record<string, () => ReactNode> = {
	cloak: CloakPanel,
	appear: AppearPanel,
	perf: PerfPanel,
	proxy: ProxyPanel,
	about: AboutPanel
};

export const SettingsPage = () => {
	const [active, setActive] = useState('cloak');
	const Panel = panels[active] ?? CloakPanel;
	const unavailableApis = apiAvailability();

	return (
		<div className="h-full w-full overflow-y-auto">
			<div className="min-h-full flex flex-col items-center px-10 pt-20 pb-24">
				<motion.h1
					initial={{ opacity: 0, y: -16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={soft}
					className="text-4xl font-bold text-white/90 tracking-tight mb-3"
				>
					Settings
				</motion.h1>

				<motion.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ ...soft, delay: 0.04 }}
					className="text-base text-white/25 mb-12"
				>
					Manage cloaking, proxy, and display preferences
				</motion.p>

				{unavailableApis && (
					<p role="status" className="text-sm text-white/50 mb-6">
						{unavailableApis}
					</p>
				)}

				<LayoutGroup>
					<motion.nav
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ ...soft, delay: 0.06 }}
						className="flex gap-2 p-2.5 rounded-2xl"
					>
						{tabs.map(t => {
							const Icon = t.icon;
							const isActive = t.id === active;
							return (
								<motion.button
									key={t.id}
									onClick={() => setActive(t.id)}
									whileTap={{ scale: 0.96 }}
									className="relative flex items-center gap-2.5 px-6 py-3.5 rounded-xl text-sm cursor-pointer z-10"
									animate={{
										color: isActive
											? 'rgba(255,255,255,0.95)'
											: 'rgba(255,255,255,0.35)'
									}}
									transition={{ duration: 0.15 }}
								>
									{isActive && (
										<motion.div
											layoutId="settings-tab"
											className="absolute inset-0 rounded-xl"
											style={{
												background:
													'var(--color-primary)',
												border: '1px solid var(--color-primary)'
											}}
											transition={spring}
										/>
									)}
									<Icon className="w-4 h-4 relative z-10" />
									<span className="relative z-10 font-medium">
										{t.label}
									</span>
								</motion.button>
							);
						})}
					</motion.nav>
				</LayoutGroup>

				<motion.div
					initial={{ opacity: 0, scaleX: 0 }}
					animate={{ opacity: 1, scaleX: 1 }}
					transition={{ ...soft, delay: 0.1 }}
					className="w-full max-w-3xl h-px mt-4 mb-14"
					style={{
						background: 'var(--color-border)'
					}}
				/>

				<div className="w-full max-w-3xl">
					<AnimatePresence mode="wait">
						<motion.div
							key={active}
							initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
							animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
							exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
							transition={soft}
						>
							<Panel />
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		</div>
	);
};
