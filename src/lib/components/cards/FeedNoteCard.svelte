<script lang="ts">
	import type { FeedNote } from '$lib/api/types';
	import { fmtDateTime } from '$lib/utils/format';

	let { note }: { note: FeedNote } = $props();
</script>

<div class="feed-note">
	<div class="fn-header">
		<span class="fn-kind">kind {note.kind}</span>
		<span class="fn-date">{fmtDateTime(note.created_at)}</span>
		<span class="fn-len">{note.content_length} chars</span>
	</div>
	<div class="fn-content">{note.content}</div>
</div>

<style>
	.feed-note {
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}
	.feed-note:hover {
		background: var(--bg-elevated);
	}
	.fn-header {
		display: flex;
		gap: 10px;
		font-size: 10px;
		color: var(--text-muted);
		margin-bottom: 4px;
	}
	.fn-kind {
		color: var(--accent);
	}
	.fn-content {
		font-size: 11px;
		color: var(--text-secondary);
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 4;
		-webkit-box-orient: vertical;
	}
</style>
