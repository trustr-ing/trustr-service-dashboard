<script lang="ts">
	import type { NoteItem } from '$lib/api/types';
	import { fmtDateTime } from '$lib/utils/format';
	import { hexToNpub } from '$lib/utils/pubkey';

	let { note }: { note: NoteItem } = $props();

	const shortNpub = $derived(hexToNpub(note.pubkey).slice(0, 12) + '...');

	let copied = $state(false);

	function copyPk(e: Event) {
		e.stopPropagation();
		navigator.clipboard.writeText(hexToNpub(note.pubkey));
		copied = true;
		setTimeout(() => { copied = false; }, 1200);
	}
</script>

<div class="note-card">
	<div class="nc-header">
		{#if note.author_picture}
			<img
				class="nc-avatar"
				src={note.author_picture}
				alt=""
				onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
			/>
		{/if}
		<div class="nc-info">
			<div class="nc-name-row">
				<span class="nc-name">{note.author_name || shortNpub}</span>
				<button class="copy-btn" onclick={copyPk} title="Copy pubkey">
					{copied ? '✓' : '⧉'}
				</button>
			</div>
			<div class="nc-date">{fmtDateTime(note.created_at)}</div>
		</div>
	</div>
	<div class="nc-meta">
		<span>score <span class="val">{note.score?.toFixed(4) ?? '—'}</span></span>
		<span>G <span class="val">{note.g_score?.toFixed(3) ?? '—'}</span></span>
		<span>kind <span class="val">{note.kind}</span></span>
	</div>
	<div class="nc-content">{note.content}</div>
</div>

<style>
	.note-card {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}
	.note-card:hover {
		background: var(--bg-elevated);
	}
	.nc-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.nc-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--bg-card);
	}
	.nc-info { min-width: 0; }
	.nc-name-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.nc-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
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
	.note-card:hover .copy-btn { opacity: 1; }
	.copy-btn:hover { color: var(--accent); }
	.nc-date {
		font-size: 10px;
		color: var(--text-muted);
	}
	.nc-meta {
		display: flex;
		gap: 12px;
		font-size: 10px;
		color: var(--text-muted);
		margin-top: 4px;
	}
	.nc-meta .val {
		color: var(--text-secondary);
		font-weight: 500;
	}
	.nc-content {
		font-size: 11px;
		color: var(--text-secondary);
		margin-top: 6px;
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
	}
</style>
