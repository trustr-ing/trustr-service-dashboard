<script lang="ts">
	import { poolWidth, shelfStats, poolCenter, clampCenter, WIDTH_PRESETS } from '$lib/stores/pool';
	import { get } from 'svelte/store';

	function setWidth(seconds: number) {
		const stats = get(shelfStats);
		if (!stats?.available) return;

		if (seconds === 0) {
			// "all" — cover the full shelf range
			const fullWidth = stats.max_ts - stats.min_ts;
			$poolWidth = fullWidth;
			$poolCenter = (stats.min_ts + stats.max_ts) / 2;
		} else {
			$poolWidth = seconds;
			$poolCenter = clampCenter(get(poolCenter), seconds, stats);
		}
	}

	const activePreset = $derived(
		WIDTH_PRESETS.find(p => {
			if (p.seconds === 0) {
				const stats = get(shelfStats);
				if (!stats?.available) return false;
				return Math.abs($poolWidth - (stats.max_ts - stats.min_ts)) < 86400;
			}
			return $poolWidth === p.seconds;
		})?.label ?? ''
	);
</script>

<div class="width-buttons">
	<span class="width-label">Width:</span>
	{#each WIDTH_PRESETS as preset}
		<button
			class="width-btn"
			class:selected={activePreset === preset.label}
			onclick={() => setWidth(preset.seconds)}
		>{preset.label}</button>
	{/each}
</div>

<style>
	.width-buttons {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.width-label {
		font-size: 10px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-right: 4px;
	}
	.width-btn {
		padding: 4px 12px;
		border-radius: 14px;
		font-size: 11px;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		transition: all 0.15s;
	}
	.width-btn:hover {
		border-color: var(--border-light);
	}
	.width-btn.selected {
		background: var(--pool-glow);
		color: var(--pool-color);
		border-color: var(--pool-dim);
	}
</style>
