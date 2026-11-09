import { useState } from 'react';
import { motion } from 'framer-motion';
import { Gamepad2, History, Search, Settings, ShieldCheck } from 'lucide-react';
import logoImg from '@assets/logo.webp';

const navItems = [
	{ id: 'home', label: 'Search', icon: Search },
	{ id: 'games', label: 'Games', icon: Gamepad2 },
	{ id: 'playback', label: 'Playback', icon: History },
	{ id: 'settings', label: 'Settings', icon: Settings },
	{ id: 'admin', label: 'Admin panel', icon: ShieldCheck }
];

import type { Session } from '../App';

interface SidebarProps {
	activeItem: string;
	isAdmin?: boolean;
	onItemClick: (id: string) => void;
	onHoverChange?: (hovered: boolean) => void;
	sessions: Session[];
	activeSession: number;
	maxSessions: number;
	onSessionChange: (id: number) => void;
	onAddSession: () => void;
	onCloseSession: (id: number) => void;
	alwaysVisible?: boolean;
}

const VDivider = ({
	blur = 0,
	transform
}: {
	blur?: number;
	transform?: string;
}) => {
	return (
		<div
			className="w-full flex justify-center"
			style={{
				transform: undefined,
				pointerEvents: 'none',
				margin: '0.35rem 0'
			}}
		>
			<div className="h-px w-6 bg-white/10" />
		</div>
	);
};

const NightPlusIcon = () => {
	return (
		<svg width="29" height="29" viewBox="0 0 29 29" fill="none">
			<defs>
				<filter
					id="filter0_ii"
					x="0"
					y="-2"
					width="29"
					height="31"
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="BackgroundImageFix"
						result="shape"
					/>
					<feColorMatrix
						in="SourceAlpha"
						type="matrix"
						values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
						result="hardAlpha"
					/>
					<feOffset />
					<feGaussianBlur stdDeviation="2" />
					<feComposite
						in2="hardAlpha"
						operator="arithmetic"
						k2="-1"
						k3="1"
					/>
					<feColorMatrix
						type="matrix"
						values="0 0 0 0 0.796078 0 0 0 0 0.65098 0 0 0 0 0.968627 0 0 0 1 0"
					/>
					<feBlend mode="normal" in2="shape" result="effect1" />
					<feColorMatrix
						in="SourceAlpha"
						type="matrix"
						values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
						result="hardAlpha"
					/>
					<feOffset dy="-2" />
					<feGaussianBlur stdDeviation="4" />
					<feComposite
						in2="hardAlpha"
						operator="arithmetic"
						k2="-1"
						k3="1"
					/>
					<feColorMatrix
						type="matrix"
						values="0 0 0 0 0.796078 0 0 0 0 0.65098 0 0 0 0 0.968627 0 0 0 0.5 0"
					/>
					<feBlend mode="normal" in2="effect1" result="effect2" />
				</filter>
				<filter
					id="filter1_f"
					x="2.19"
					y="2.45"
					width="24.36"
					height="24.36"
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="BackgroundImageFix"
						result="shape"
					/>
					<feGaussianBlur stdDeviation="2" result="blur" />
				</filter>
				<filter
					id="filter2_f"
					x="10.5"
					y="5.83"
					width="12.67"
					height="12.67"
					filterUnits="userSpaceOnUse"
					colorInterpolationFilters="sRGB"
				>
					<feFlood floodOpacity="0" result="BackgroundImageFix" />
					<feBlend
						mode="normal"
						in="SourceGraphic"
						in2="BackgroundImageFix"
						result="shape"
					/>
					<feGaussianBlur stdDeviation="2" result="blur" />
				</filter>
			</defs>
			<g filter="url(#filter0_ii)">
				<rect
					x="1"
					y="1"
					width="27"
					height="27"
					rx="13.5"
					fill="#11111B"
				/>
			</g>
			<rect
				x="0.5"
				y="0.5"
				width="28"
				height="28"
				rx="14"
				stroke="#CBA6F7"
			/>
			<g filter="url(#filter1_f)">
				<path
					d="M12.4326 6.45193C10.5446 7.76485 9.30769 9.94877 9.30762 12.4226C9.30762 16.4373 12.5625 19.6922 16.5771 19.6922C19.0514 19.6921 21.235 18.4546 22.5479 16.5662C21.6292 20.1546 18.3748 22.8074 14.5 22.8074C9.91184 22.8073 6.19238 19.088 6.19238 14.4998C6.19238 10.6254 8.84474 7.37094 12.4326 6.45193Z"
					fill="#CBA6F7"
				/>
			</g>
			<g filter="url(#filter2_f)">
				<path
					d="M16.8369 9.82693C17.1594 9.82714 17.4209 10.0884 17.4209 10.4109V11.5789H18.5889C18.9114 11.5789 19.1726 11.8404 19.1729 12.1629C19.1729 12.4855 18.9115 12.7478 18.5889 12.7478H17.4209V13.9158C17.4208 14.2382 17.1593 14.4996 16.8369 14.4998C16.5144 14.4998 16.252 14.2383 16.252 13.9158V12.7478H15.084C14.7614 12.7478 14.5 12.4854 14.5 12.1629C14.5002 11.8405 14.7616 11.579 15.084 11.5789H16.252V10.4109C16.252 10.0883 16.5143 9.82693 16.8369 9.82693Z"
					fill="#CBA6F7"
				/>
			</g>
			<path
				d="M12.4326 6.45193C10.5446 7.76485 9.30769 9.94877 9.30762 12.4226C9.30762 16.4373 12.5625 19.6922 16.5771 19.6922C19.0514 19.6921 21.235 18.4546 22.5479 16.5662C21.6292 20.1546 18.3748 22.8074 14.5 22.8074C9.91184 22.8073 6.19238 19.088 6.19238 14.4998C6.19238 10.6254 8.84474 7.37094 12.4326 6.45193Z"
				fill="#CBA6F7"
			/>
			<path
				d="M16.8369 9.82693C17.1594 9.82714 17.4209 10.0884 17.4209 10.4109V11.5789H18.5889C18.9114 11.5789 19.1726 11.8404 19.1729 12.1629C19.1729 12.4855 18.9115 12.7478 18.5889 12.7478H17.4209V13.9158C17.4208 14.2382 17.1593 14.4996 16.8369 14.4998C16.5144 14.4998 16.252 14.2383 16.252 13.9158V12.7478H15.084C14.7614 12.7478 14.5 12.4854 14.5 12.1629C14.5002 11.8405 14.7616 11.579 15.084 11.5789H16.252V10.4109C16.252 10.0883 16.5143 9.82693 16.8369 9.82693Z"
				fill="#CBA6F7"
			/>
		</svg>
	);
};

const LogoImage = () => {
	return (
		<div className="relative w-8 h-8">
			<img
				src={logoImg}
				alt=""
				className="h-full w-full rounded-lg object-cover"
				style={{ opacity: 0.9 }}
			/>
		</div>
	);
};

export const Sidebar = ({
	activeItem,
	isAdmin = false,
	onItemClick,
	onHoverChange,
	alwaysVisible = false
}: SidebarProps) => {
	const [hovered, setHovered] = useState(false);
	const isHome = activeItem === '' || activeItem === 'home';

	const handleHover = (isHovered: boolean) => {
		setHovered(isHovered);
		onHoverChange?.(isHovered);
	};

	const isVisible = alwaysVisible || hovered;

	return (
		<div
			className="fixed left-0 bottom-0 z-50 flex h-[calc(100vh-3.5rem)] w-4 flex-col items-center"
			onMouseEnter={() => handleHover(true)}
			onMouseLeave={() => handleHover(false)}
		>
			<motion.div
				className="fixed left-0 top-1/2 h-24 w-1 rounded-r-md"
				style={{
					background: 'var(--color-border-strong)'
				}}
				animate={{
					opacity: isVisible ? 0 : 1,
					x: isVisible ? -4 : 0,
					y: '-50%'
				}}
				transition={{ duration: 0.2 }}
			/>

			<motion.nav
				initial={{ x: -80, opacity: 0 }}
				animate={{
					x: isVisible ? 8 : -80,
					opacity: isVisible ? 1 : 0
				}}
				transition={{ type: 'spring', stiffness: 300, damping: 30 }}
				className="fixed bottom-0 left-0 flex h-[calc(100vh-4rem+8px)] w-16 flex-col items-center justify-center-safe"
			>
				<div
					className="relative flex w-14 flex-col items-center rounded-xl"
					style={{
						background: 'rgba(22, 22, 22, 0.96)',
						border: '1px solid var(--color-border)',
						padding: '0.75rem 0.35rem'
					}}
				>
					<motion.button
						aria-label="Home"
						whileHover={{ scale: 1.1 }}
						whileTap={{ scale: 0.95 }}
						onClick={() => onItemClick('')}
						className="flex items-center justify-center mb-1"
					>
						<LogoImage />
					</motion.button>

					{navItems.filter(item => isAdmin || item.id !== 'admin').map(item => {
						const Icon = item.icon;
						const isActive = item.id === 'home' ? isHome : activeItem === item.id;
						return (
							<motion.button
								key={item.id}
								aria-label={item.label}
								title={item.label}
								whileHover={{ scale: 1.04 }}
								whileTap={{ scale: 0.95 }}
								onClick={() => {
									onItemClick(item.id === 'home' ? '' : item.id);
								}}
								className="relative z-10 flex h-9 w-9 items-center justify-center rounded-lg"
							>
								<Icon
									strokeWidth={isActive ? 2.5 : 1.8}
									className={`h-5 w-5 transition-all duration-200 ${isActive ? 'scale-105 text-white' : 'text-zinc-500'}`}
								/>
							</motion.button>
						);
					})}

				</div>
			</motion.nav>
		</div>
	);
};
