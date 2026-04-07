<script lang="ts">
	import type { RecItem } from '$lib/api/types';
	import { hexToNpub } from '$lib/utils/pubkey';

	let { rec }: { rec: RecItem } = $props();

	const npub = $derived(hexToNpub(rec.pubkey));
	const shortNpub = $derived(npub.slice(0, 12) + '...');

	let copied = $state(false);

	function copyPk(e: Event) {
		e.stopPropagation();
		navigator.clipboard.writeText(hexToNpub(rec.pubkey));
		copied = true;
		setTimeout(() => { copied = false; }, 1200);
	}
</script>

<div class="rec-card">
	<div class="rc-header">
		{#if rec.picture}
			<img
				class="rc-avatar"
				src={rec.picture}
				alt=""
				onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
			/>
		{/if}
		<div class="rc-info">
			<div class="rc-name">{rec.name || shortNpub}</div>
			<div class="rc-pk-row">
				<span class="rc-pk">{shortNpub}</span>
				<button class="copy-btn" onclick={copyPk} title="Copy pubkey">
					{copied ? '✓' : '⧉'}
				</button>
			</div>
		</div>
	</div>
	<div class="rc-meta">
		<span>sim <span class="val">{rec.similarity?.toFixed(4) ?? '—'}</span></span>
		<span>G <span class="val">{rec.g_score?.toFixed(3) ?? '—'}</span></span>
		<span>notes <span class="val">{rec.note_count ?? 0}</span></span>
		{#if rec.zaps_in_sats}
			<span>zaps <span class="val">{rec.zaps_in_sats.toLocaleString()} sats</span></span>
		{/if}
	</div>
	{#if rec.about}
		<div class="rc-about">{rec.about}</div>
	{/if}
</div>

<style>
	.rec-card {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}
	.rec-card:hover {
		background: var(--bg-elevated);
	}
	.rc-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.rc-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--bg-card);
	}
	.rc-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
	}
	.rc-info { min-width: 0; }
	.rc-pk-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.rc-pk {
		font-size: 10px;
		color: var(--text-muted);
		font-family: monospace;
	}
	.copy-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 11px;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
	}
	.rec-card:hover .copy-btn { opacity: 1; }
	.copy-btn:hover { color: var(--accent); }
	.rc-meta {
		display: flex;
		gap: 12px;
		font-size: 10px;
		color: var(--text-muted);
		margin-top: 4px;
	}
	.rc-meta .val {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.rc-about {
		font-size: 11px;
		color: var(--text-secondary);
		margin-top: 6px;
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}
</style>
