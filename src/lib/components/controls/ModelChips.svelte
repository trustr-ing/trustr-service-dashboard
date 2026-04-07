<script lang="ts">
	const MODELS = ['semantic', 'fused', 'social', 'community'] as const;

	let { value = $bindable('fused') }: { value: string } = $props();
</script>

<div class="model-field">
	<label>Embedding model</label>
	<div class="model-chips">
		{#each MODELS as m}
			<button
				class="model-chip"
				class:selected={value === m}
				onclick={() => value = m}
			>{m}</button>
		{/each}
	</div>
</div>

<style>
	label {
		display: block;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 6px;
	}
	.model-chips {
		display: flex;
		gap: 6px;
	}
	.model-chip {
		padding: 4px 12px;
		border-radius: 14px;
		font-size: 11px;
		cursor: pointer;
		user-select: none;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		transition: all 0.15s;
	}
	.model-chip:hover { border-color: var(--border-light); }
	.model-chip.selected {
		background: var(--accent-glow);
		color: var(--accent);
		border-color: var(--accent-dim);
	}
</style>
