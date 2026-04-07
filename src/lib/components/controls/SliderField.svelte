<script lang="ts">
	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		displayValue
	}: {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		displayValue?: string;
	} = $props();

	const display = $derived(displayValue ?? String(value));
</script>

<div class="slider-field">
	<div class="slider-label">
		<label>{label}</label>
		<span>{display}</span>
	</div>
	<input type="range" {min} {max} {step} bind:value />
</div>

<style>
	.slider-field {
		width: 100%;
	}
	.slider-label {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 6px;
	}
	.slider-label span {
		color: var(--accent);
		font-weight: 500;
	}
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		background: var(--border);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg-surface);
		cursor: pointer;
	}
	input[type="range"]::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg-surface);
		cursor: pointer;
	}
</style>
