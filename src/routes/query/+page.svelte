<script lang="ts">
	import LensSelector from '$lib/components/controls/LensSelector.svelte';
	import WidthButtons from '$lib/components/controls/WidthButtons.svelte';
	import DensityChart from '$lib/components/viz/DensityChart.svelte';
	import QueryCard, { type QueryParams } from '$lib/components/cards/QueryCard.svelte';

	import { shelfStats, poolCenter, poolWidth, poolBounds, clampCenter } from '$lib/stores/pool';
	import { fmtNum, fmtDate } from '$lib/utils/format';
	import { browser } from '$app/environment';

	const STORAGE_KEY = 'trustr-queries';

	interface StoredQuery { id: number; params?: QueryParams }

	// Load saved queries from localStorage
	function loadQueries(): StoredQuery[] {
		if (!browser) return [];
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			return JSON.parse(raw);
		} catch { return []; }
	}

	function saveQueries() {
		if (!browser) return;
		const data = queries.map(q => ({ id: q.id, params: latestParams.get(q.id) ?? q.params }));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	// Query card management
	const restored = loadQueries();
	let nextId = $state(restored.length > 0 ? Math.max(...restored.map(q => q.id)) + 1 : 1);
	let queries = $state<StoredQuery[]>(restored);

	function addQuery() {
		queries = [...queries, { id: nextId++ }];
		saveQueries();
	}

	function deleteQuery(id: number) {
		queries = queries.filter(q => q.id !== id);
		saveQueries();
	}

	function duplicateQuery(_id: number, params: QueryParams) {
		queries = [...queries, { id: nextId++, params }];
		saveQueries();
	}

	// Track latest params per card for saving, without mutating the reactive array
	const latestParams = new Map<number, QueryParams>();

	function handleParamsChange(id: number, params: QueryParams) {
		latestParams.set(id, params);
		if (!browser) return;
		const data = queries.map(q => ({ id: q.id, params: latestParams.get(q.id) ?? q.params }));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	}

	// Pool stats
	const poolEventCount = $derived.by(() => {
		const stats = $shelfStats;
		if (!stats?.available) return 0;
		const bounds = $poolBounds;
		let count = 0;
		for (let i = 0; i < stats.daily_counts.length; i++) {
			const dayTs = stats.day_start + i * stats.day_seconds;
			if (dayTs >= bounds.start && dayTs < bounds.end) {
				count += stats.daily_counts[i];
			}
		}
		return count;
	});

	function handlePan(newCenter: number) {
		const stats = $shelfStats;
		if (!stats?.available) return;
		$poolCenter = clampCenter(newCenter, $poolWidth, stats);
	}

	function handleWidthChange(newWidth: number) {
		const stats = $shelfStats;
		if (!stats?.available) return;
		$poolWidth = newWidth;
		$poolCenter = clampCenter($poolCenter, newWidth, stats);
	}
</script>

<svelte:head>
	<title>TRUSTr / Query Builder</title>
</svelte:head>

<!-- Lens selector -->
<section class="panel">
	<LensSelector />
</section>

<!-- Data pool -->
{#if $shelfStats?.available}
	<section class="panel pool-panel">
		<div class="panel-header">
			<h3>Data Pool</h3>
			<span class="panel-subtitle">event retrieval scope</span>
		</div>
		<div class="pool-body">
			<WidthButtons />

			<DensityChart
				dayStart={$shelfStats.day_start}
				daySeconds={$shelfStats.day_seconds}
				dailyCounts={$shelfStats.daily_counts}
				poolStart={$poolBounds.start}
				poolEnd={$poolBounds.end}
				minTs={$shelfStats.min_ts}
				maxTs={$shelfStats.max_ts}
				onpan={handlePan}
				onwidthchange={handleWidthChange}
			/>

			<div class="pool-stats">
				<div><span class="stat-val">{fmtNum(poolEventCount)}</span> events</div>
				<div><span class="stat-val">{fmtNum($shelfStats.pubkey_count)}</span> pubkeys</div>
				<div><span class="stat-val">{fmtDate($poolBounds.start)}</span> — <span class="stat-val">{fmtDate($poolBounds.end)}</span></div>
			</div>
		</div>
	</section>
{/if}

<!-- Query cards -->
<div class="query-list">
	{#each queries as q (q.id)}
		<QueryCard
			ondelete={() => deleteQuery(q.id)}
			onduplicate={(params) => duplicateQuery(q.id, params)}
			onparamschange={(params) => handleParamsChange(q.id, params)}
			initialParams={q.params}
		/>
	{/each}
</div>

<!-- Empty state / add button -->
{#if queries.length === 0}
	<div class="empty-state">
		<div class="empty-icon">+</div>
		<h3>No recommendation queries yet</h3>
		<p>Create a query to find recommended follows and notes.
			Each query has its own model, trust settings, context, and filters.</p>
		<button class="add-first-btn" onclick={addQuery}>Create first query</button>
	</div>
{/if}

<button class="fab" onclick={addQuery} title="New query">+</button>

<style>
	.panel {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 16px 18px;
		margin-bottom: 20px;
	}
	.pool-panel {
		border-color: rgba(128, 203, 196, 0.2);
	}
	.panel-header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
	}
	.panel-header h3 {
		font-size: 12px;
		font-weight: 500;
		color: var(--pool-color);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}
	.panel-subtitle {
		font-size: 10px;
		color: var(--text-muted);
		margin-left: auto;
	}
	.pool-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.pool-stats {
		display: flex;
		gap: 20px;
		padding: 10px 14px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.pool-stats .stat-val {
		color: var(--pool-color);
		font-weight: 500;
	}

	/* Query list */
	.query-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 20px;
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: var(--text-muted);
	}
	.empty-icon {
		font-size: 48px;
		opacity: 0.2;
		margin-bottom: 12px;
	}
	.empty-state h3 {
		font-size: 14px;
		font-weight: 400;
		color: var(--text-secondary);
		margin-bottom: 8px;
	}
	.empty-state p {
		font-size: 12px;
		line-height: 1.6;
		max-width: 420px;
		margin: 0 auto 20px;
	}
	.add-first-btn {
		padding: 10px 24px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		font-family: inherit;
		border: 2px solid var(--accent);
		background: var(--accent-dim);
		color: #fff;
		cursor: pointer;
		transition: all 0.2s;
	}
	.add-first-btn:hover {
		background: var(--accent);
		color: #000;
	}

	/* Floating add button */
	.fab {
		position: fixed;
		bottom: 28px;
		right: 28px;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: var(--accent-dim);
		border: 2px solid var(--accent);
		color: #fff;
		font-size: 26px;
		font-weight: 300;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		box-shadow: 0 4px 20px rgba(79, 195, 247, 0.2);
		z-index: 50;
	}
	.fab:hover {
		background: var(--accent);
		color: #000;
		transform: scale(1.08);
		box-shadow: 0 6px 30px rgba(79, 195, 247, 0.35);
	}
</style>
