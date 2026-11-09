export interface HsvColor {
	hue: number;
	saturation: number;
	value: number;
}

export const hexToHsv = (hex: string): HsvColor => {
	const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '0045ff';
	const red = parseInt(normalized.slice(0, 2), 16) / 255;
	const green = parseInt(normalized.slice(2, 4), 16) / 255;
	const blue = parseInt(normalized.slice(4, 6), 16) / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const delta = max - min;

	let hue = 0;
	if (delta !== 0) {
		if (max === red) hue = 60 * (((green - blue) / delta) % 6);
		else if (max === green) hue = 60 * ((blue - red) / delta + 2);
		else hue = 60 * ((red - green) / delta + 4);
	}

	return {
		hue: (hue + 360) % 360,
		saturation: max === 0 ? 0 : delta / max,
		value: max
	};
};

export const hsvToHex = ({ hue, saturation, value }: HsvColor): string => {
	const chroma = value * saturation;
	const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const offset = value - chroma;
	const segment = Math.floor((((hue % 360) + 360) % 360) / 60);
	const channels =
		segment === 0
			? [chroma, secondary, 0]
			: segment === 1
				? [secondary, chroma, 0]
				: segment === 2
					? [0, chroma, secondary]
					: segment === 3
						? [0, secondary, chroma]
						: segment === 4
							? [secondary, 0, chroma]
							: [chroma, 0, secondary];

	return `#${channels
		.map(channel =>
			Math.round((channel + offset) * 255)
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;
};

export const applyAccentColor = (
	style: Pick<CSSStyleDeclaration, 'setProperty'>,
	color: string
): void => {
	style.setProperty('--color-primary', color);
	style.setProperty('--color-accent', color);
	style.setProperty(
		'--color-primary-light',
		`color-mix(in srgb, ${color} 55%, white)`
	);
	style.setProperty(
		'--color-primary-dark',
		`color-mix(in srgb, ${color} 72%, black)`
	);
};
