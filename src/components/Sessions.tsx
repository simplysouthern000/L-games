import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import type { Session } from '../App';

interface SessionsProps {
	sessions: Session[];
	activeSession: number;
	maxSessions: number;
	highlightActive?: boolean;
	onSessionChange: (id: number) => void;
	onAddSession: () => void;
	onCloseSession: (id: number) => void;
}

export const Sessions = ({
	sessions,
	activeSession,
	maxSessions,
	highlightActive = true,
	onSessionChange,
	onAddSession,
	onCloseSession
}: SessionsProps) => {
	const [hoveredSession, setHoveredSession] = useState<number | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const atMax = sessions.length >= maxSessions;

	const handleSessionClick = (session: Session) => {
		if (
			highlightActive &&
			activeSession === session.id &&
			hoveredSession === session.id
		) {
			onCloseSession(session.id);
		} else {
			onSessionChange(session.id);
		}
	};

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const activeIdx = sessions.findIndex(s => s.id === activeSession);
		const child = el.children[activeIdx] as HTMLElement | undefined;
		child?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [activeSession, sessions]);

	return (
		<div
			className={
				'flex flex-col items-center justify-end ' +
				`${sessions.length >= maxSessions ? 'grow' : 'mt-0'}`
			}
			style={{ minHeight: 0 }}
		>
			<div
				ref={scrollRef}
				className="flex flex-col items-center -mt-2"
				style={{
					overflowY: 'auto',
					overflowX: 'hidden',
					scrollbarWidth: 'none',
					msOverflowStyle: 'none',
					minHeight: 0,
					paddingInline: 28,
					paddingTop: 8,
					paddingBottom: 14,
					marginInline: -20
				}}
			>
				{sessions.map((session, index) => {
					const isCurrentSession = activeSession === session.id;
					const isActive = highlightActive && isCurrentSession;
					const isHovered = hoveredSession === session.id;
					const showClose = isActive && isHovered;
					return (
						<motion.button
							key={session.id}
							onClick={() => handleSessionClick(session)}
							onMouseEnter={() => setHoveredSession(session.id)}
							onMouseLeave={() => setHoveredSession(null)}
							initial={false}
							whileHover={{
								scale: 1.04
							}}
							whileTap={{ scale: 0.92 }}
							className="relative mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
							style={{
								background: isActive
									? 'color-mix(in srgb, var(--color-primary) 20%, transparent)'
									: 'rgba(26, 26, 26, 0.8)',
								border: isActive
									? '1px solid color-mix(in srgb, var(--color-primary-light) 32%, transparent)'
									: '1px solid rgba(45, 45, 58, 0.5)',
								boxShadow: isActive
									? 'inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 12%, transparent)'
									: 'inset 0 1px 1px rgba(255,255,255,0.03)'
							}}
							transition={{ duration: 0.2 }}
						>
							<AnimatePresence mode="wait">
								{showClose ? (
									<motion.div
										key="close"
										initial={{
											scale: 0.5,
											opacity: 0,
											rotate: -90
										}}
										animate={{
											scale: 1,
											opacity: 1,
											rotate: 0
										}}
										exit={{
											scale: 0.5,
											opacity: 0,
											rotate: 90
										}}
										transition={{
											stiffness: 250,
											damping: 15,
											duration: 0.2
										}}
									>
										<X className="w-4 h-4" style={{ color: 'var(--color-primary-light)' }} />
									</motion.div>
								) : (
									<span
										key={`label-${session.id}`}
										className={`text-sm font-medium ${isActive ? '' : 'text-zinc-500'}`}
										style={isActive ? { color: 'var(--color-primary-light)' } : undefined}
									>
										{index + 1}
									</span>
								)}
							</AnimatePresence>
							{isActive && (
								<motion.div
									layoutId="session-indicator"
									className="absolute inset-0 rounded-xl pointer-events-none"
									initial={false}
									style={{
										background:
											'color-mix(in srgb, var(--color-primary) 8%, transparent)',
										outline:
											'1px solid color-mix(in srgb, var(--color-primary-light) 24%, transparent)'
									}}
									transition={{
										type: 'spring',
										stiffness: 340,
										damping: 24
									}}
								/>
							)}
						</motion.button>
					);
				})}
			</div>

			<AnimatePresence>
				{!atMax && (
					<motion.button
						onClick={onAddSession}
						whileHover={{ scale: 1.04 }}
						whileTap={{ scale: 0.9 }}
						initial={false}
						transition={{
							type: 'spring',
							stiffness: 200,
							damping: 10
						}}
						className="w-7 h-7 rounded-full flex items-center -mt-2 justify-center shrink-0"
						style={{
							background: 'rgba(26, 26, 26, 0.9)',
							border: '1px solid rgba(45, 45, 58, 0.6)',
							boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.05)'
						}}
					>
						<Plus className="w-3.5 h-3.5 text-zinc-500" />
					</motion.button>
				)}
			</AnimatePresence>
		</div>
	);
};
