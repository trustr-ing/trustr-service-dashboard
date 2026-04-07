<script lang="ts">
	import { page } from '$app/state';
	import PubkeyInput from '$lib/components/layout/PubkeyInput.svelte';
	import ModelChips from '$lib/components/controls/ModelChips.svelte';
	import ProfileCard from '$lib/components/cards/ProfileCard.svelte';
	import FeedNoteCard from '$lib/components/cards/FeedNoteCard.svelte';
	import RecCard from '$lib/components/cards/RecCard.svelte';
	import NoteCard from '$lib/components/cards/NoteCard.svelte';

	import { selectedCodename } from '$lib/stores/codename';
	import { getUserProfile, getUserFeed, getUserRecs, getUserTimeline } from '$lib/api/endpoints';
	import type { UserProfile, FeedNote, RecItem, NoteItem } from '$lib/api/types';

	const urlPk = page.url.searchParams.get('pk');

	let pubkey = $state(urlPk ?? '');
	let pubkeyValid = $state(false);
	let effectivePk = $state('');
	let model = $state('fused');
	let autoLoaded = $state(false);

	let loading = $state(false);
	let error = $state('');

	let profile = $state<UserProfile | null>(null);
	let feedNotes = $state<FeedNote[]>([]);
	let recs = $state<RecItem[]>([]);
	let timelineNotes = $state<NoteItem[]>([]);

	let simThreshold = $state(0); // 0-100

	const filteredRecs = $derived(
		recs.filter(r => (r.similarity ?? 0) * 100 >= simThreshold)
	);

	async function loadUser() {
		if (!pubkeyValid) return;

		loading = true;
		error = '';
		profile = null;
		feedNotes = [];
		recs = [];
		timelineNotes = [];

		try {
			const codename = $selectedCodename;

			const pk = effectivePk;
			const [profileResp, feedResp, recsResp, timelineResp] = await Promise.all([
				getUserProfile(pk, codename),
				getUserFeed(pk, 100),
				getUserRecs(pk, { codename, model, limit: 50 }),
				getUserTimeline(pk, { codename, model: model === 'community' ? 'semantic' : model, limit: 100 }),
			]);

			profile = profileResp;
			feedNotes = feedResp.notes;
			recs = recsResp.recs;
			timelineNotes = timelineResp.notes;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function reloadWithModel() {
		if (!pubkeyValid || !profile) return;
		const codename = $selectedCodename;
		const pk = effectivePk;
		try {
			const [recsResp, timelineResp] = await Promise.all([
				getUserRecs(pk, { codename, model, limit: 50 }),
				getUserTimeline(pk, { codename, model: model === 'community' ? 'semantic' : model, limit: 100 }),
			]);
			recs = recsResp.recs;
			timelineNotes = timelineResp.notes;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	// Auto-load when navigated with ?pk= param
	$effect(() => {
		if (urlPk && pubkeyValid && !autoLoaded) {
			autoLoaded = true;
			loadUser();
		}
	});
</script>

<svelte:head>
	<title>TRUSTr / Explore</title>
</svelte:head>

<!-- Search bar -->
<div class="search-bar">
	<div class="search-row">
		<div class="pk-wrap">
			<PubkeyInput bind:value={pubkey} onresolved={(pk, v) => { effectivePk = pk; pubkeyValid = v; }} />
		</div>
		<div class="model-wrap">
			<ModelChips bind:value={model} />
		</div>
		<button class="load-btn" onclick={loadUser} disabled={!pubkeyValid || loading}>
			{loading ? 'Loading...' : 'Load'}
		</button>
	</div>
</div>

{#if error}
	<div class="error-msg">{error}</div>
{/if}

{#if profile}
	<!-- Controls row -->
	<div class="controls-row">
		<div class="sim-filter">
			<label>
				Similarity &ge; <span class="val">{simThreshold}%</span>
			</label>
			<input type="range" min={0} max={100} step={1} bind:value={simThreshold} />
		</div>
		<button class="reload-btn" onclick={reloadWithModel}>Reload ({model})</button>
	</div>

	<!-- Three-panel layout -->
	<div class="panels">
		<!-- Panel 1: User profile + own notes -->
		<div class="panel">
			<div class="panel-header">
				<h3>Profile & Feed</h3>
				<span class="panel-count">{feedNotes.length} notes</span>
			</div>
			<div class="panel-scroll">
				<ProfileCard {profile} />
				{#each feedNotes as note (note.id)}
					<FeedNoteCard {note} />
				{:else}
					<div class="empty">No notes found</div>
				{/each}
			</div>
		</div>

		<!-- Panel 2: Recommended follows -->
		<div class="panel">
			<div class="panel-header snap-header">
				<h3>Recommended Follows</h3>
				<span class="panel-count">{filteredRecs.length} / {recs.length}</span>
			</div>
			<div class="panel-scroll">
				{#each filteredRecs as rec (rec.pubkey)}
					<RecCard {rec} />
				{:else}
					<div class="empty">No recommendations above threshold</div>
				{/each}
			</div>
		</div>

		<!-- Panel 3: Recommended feed -->
		<div class="panel">
			<div class="panel-header pool-header">
				<h3>Recommended Notes</h3>
				<span class="panel-count">{timelineNotes.length} notes</span>
			</div>
			<div class="panel-scroll">
				{#each timelineNotes as note (note.id)}
					<NoteCard {note} />
				{:else}
					<div class="empty">No notes found</div>
				{/each}
			</div>
		</div>
	</div>
{:else if !loading && !error}
	<div class="placeholder">
		<div class="placeholder-icon">&#128269;</div>
		<p>Enter a pubkey and click <strong>Load</strong> to explore recommendations.</p>
	</div>
{/if}

<style>
	.search-bar {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 14px 18px;
		margin-bottom: 16px;
	}
	.search-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
	}
	.pk-wrap { flex: 2; }
	.model-wrap { flex: 1; }
	.load-btn {
		padding: 8px 20px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 500;
		border: 2px solid var(--accent);
		background: var(--accent-dim);
		color: #fff;
		transition: all 0.2s;
		white-space: nowrap;
	}
	.load-btn:hover:not(:disabled) {
		background: var(--accent);
		color: #000;
	}
	.load-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
		padding: 8px 14px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.sim-filter {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
	}
	.sim-filter label {
		font-size: 11px;
		color: var(--text-secondary);
		white-space: nowrap;
	}
	.sim-filter .val {
		color: var(--accent);
		font-weight: 500;
	}
	.sim-filter input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		flex: 1;
		height: 4px;
		background: var(--border);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
	}
	.sim-filter input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg-surface);
	}
	.sim-filter input[type="range"]::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg-surface);
	}
	.reload-btn {
		padding: 4px 14px;
		border-radius: 4px;
		font-size: 11px;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		transition: all 0.15s;
	}
	.reload-btn:hover {
		border-color: var(--accent-dim);
		color: var(--accent);
	}

	.panels {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 16px;
		min-height: 600px;
	}
	.panel {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.panel-header {
		padding: 12px 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.panel-header h3 {
		font-size: 11px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--text-secondary);
	}
	.snap-header h3 { color: var(--snap-color); }
	.pool-header h3 { color: var(--pool-color); }
	.panel-count {
		font-size: 10px;
		color: var(--text-muted);
	}
	.panel-scroll {
		flex: 1;
		overflow-y: auto;
		max-height: 700px;
	}

	.empty {
		padding: 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 11px;
	}
	.error-msg {
		text-align: center;
		padding: 20px;
		color: var(--tier-x);
		font-size: 12px;
		margin-bottom: 16px;
	}
	.placeholder {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 60px 24px;
		text-align: center;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1.6;
	}
	.placeholder-icon {
		font-size: 36px;
		margin-bottom: 12px;
		opacity: 0.3;
	}

	@media (max-width: 1000px) {
		.panels { grid-template-columns: 1fr; }
		.search-row { flex-direction: column; align-items: stretch; }
	}
</style>
