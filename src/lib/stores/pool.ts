import { writable, derived } from 'svelte/store';
import type { ShelfStats } from '$lib/api/types';

export const shelfStats = writable<ShelfStats | null>(null);

// Pool is defined by CENTER + WIDTH
export const poolCenter = writable<number>(0);
export const poolWidth = writable<number>(30 * 86400); // default 30 days

export const poolBounds = derived(
	[poolCenter, poolWidth],
	([$center, $width]) => ({
		start: Math.floor($center - $width / 2),
		end: Math.floor($center + $width / 2)
	})
);

// Initialize pool center to shelf midpoint when stats load
export function initPoolFromStats(stats: ShelfStats) {
	if (!stats.available) return;
	// Default center to recent data (max_ts - 15 days)
	const defaultCenter = stats.max_ts - 15 * 86400;
	poolCenter.set(Math.max(defaultCenter, stats.min_ts));
}

// Clamp center so the window stays within shelf bounds
export function clampCenter(center: number, width: number, stats: ShelfStats): number {
	const halfW = width / 2;
	const minCenter = stats.min_ts + halfW;
	const maxCenter = stats.max_ts - halfW;
	if (minCenter >= maxCenter) {
		return (stats.min_ts + stats.max_ts) / 2;
	}
	return Math.max(minCenter, Math.min(maxCenter, center));
}

export const WIDTH_PRESETS = [
	{ label: '7d', seconds: 7 * 86400 },
	{ label: '30d', seconds: 30 * 86400 },
	{ label: '3mo', seconds: 90 * 86400 },
	{ label: '6mo', seconds: 180 * 86400 },
	{ label: 'all', seconds: 0 }, // 0 = full range
] as const;
