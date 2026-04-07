<script lang="ts">
	// import ModelChips from '$lib/components/controls/ModelChips.svelte';
	import SliderField from '$lib/components/controls/SliderField.svelte';
	import PubkeyInput from '$lib/components/layout/PubkeyInput.svelte';
	import FilterPanel from '$lib/components/controls/FilterPanel.svelte';
	import RecCard from '$lib/components/cards/RecCard.svelte';
	import NoteCard from '$lib/components/cards/NoteCard.svelte';

	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { hexToNpub } from '$lib/utils/pubkey';
	import { selectedCodename } from '$lib/stores/codename';
	import { poolBounds } from '$lib/stores/pool';
	import { followList, muteList, isSignedIn } from '$lib/stores/signer';
	import { getUserRecs, getUserTimeline } from '$lib/api/endpoints';
	import type { RecItem, NoteItem } from '$lib/api/types';

	export interface QueryParams {
		name: string;
		pubkey: string;
		model: string;
		trustMinRaw: number;
		lambdaRaw: number;
		context: string;
		contextWeight: number;
		pubkeyLimit: number;
		noteLimit: number;
		excludeFollows: boolean;
		excludeMutes: boolean;
		minNotes: number;
		reversePk: boolean;
		reverseNotes: boolean;
		excludePubkeys: string[];
		blockedTerms: string[];
	}

	let {
		ondelete,
		onduplicate,
		onparamschange,
		initialParams,
	}: {
		ondelete: () => void;
		onduplicate: (params: QueryParams) => void;
		onparamschange?: (params: QueryParams) => void;
		initialParams?: QueryParams;
	} = $props();

	// Identity
	let name = $state(initialParams?.name ?? '');

	// Query config
	let pubkey = $state(initialParams?.pubkey ?? '');
	let pubkeyValid = $state(false);
	let effectivePk = $state('');
	const model = 'fused'; // hardcoded — architecture detail, not user-facing
	let trustMinRaw = $state(initialParams?.trustMinRaw ?? 1);
	let lambdaRaw = $state(initialParams?.lambdaRaw ?? 5);
	let context = $state(initialParams?.context ?? '');
	let contextWeight = $state(initialParams?.contextWeight ?? 6);
	let pubkeyLimit = $state(initialParams?.pubkeyLimit ?? 20);
	let noteLimit = $state(initialParams?.noteLimit ?? 50);

	// Filter state
	let excludeFollows = $state(initialParams?.excludeFollows ?? true);
	let excludeMutes = $state(initialParams?.excludeMutes ?? true);
	let minNotes = $state(initialParams?.minNotes ?? 30);
	let reversePk = $state(initialParams?.reversePk ?? false);
	let reverseNotes = $state(initialParams?.reverseNotes ?? false);
	let excludePubkeys = $state<string[]>(initialParams?.excludePubkeys ? [...initialParams.excludePubkeys] : []);
	let blockedTerms = $state<string[]>(initialParams?.blockedTerms ? [...initialParams.blockedTerms] : []);

	function getParams(): QueryParams {
		return {
			name, pubkey, model, trustMinRaw, lambdaRaw, context, contextWeight,
			pubkeyLimit, noteLimit, excludeFollows, excludeMutes, minNotes, reversePk,
			reverseNotes, excludePubkeys: [...excludePubkeys], blockedTerms: [...blockedTerms],
		};
	}

	// Notify parent of param changes for persistence (debounced)
	let saveTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		// Touch all reactive params so the effect tracks them
		void [name, pubkey, trustMinRaw, lambdaRaw, context, contextWeight,
			pubkeyLimit, noteLimit, excludeFollows, excludeMutes, minNotes, reversePk,
			reverseNotes, excludePubkeys, blockedTerms];
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => onparamschange?.(getParams()), 300);
	});

	// UI state
	let expanded = $state(true);
	let configOpen = $state(true);
	let filtersOpen = $state(false);

	// Derived
	const trustMin = $derived(trustMinRaw / 100);
	const lambda = $derived(lambdaRaw / 10);
	const ctxWeight = $derived(contextWeight / 10);

	// Results
	let loading = $state(false);
	let error = $state('');
	let recs = $state<RecItem[]>([]);
	let notes = $state<NoteItem[]>([]);
	let hasResults = $state(false);
	let elapsed = $state(0);

	// Client-side filtering
	function matchesTerm(text: string): boolean {
		if (!blockedTerms.length || !text) return false;
		const lower = text.toLowerCase();
		return blockedTerms.some(t => lower.includes(t));
	}

	// Build a set of pubkeys below the min-notes threshold from recs data
	const lowNoteAuthors = $derived.by(() => {
		if (minNotes <= 0) return new Set<string>();
		const low = new Set<string>();
		for (const r of recs) {
			if (r.note_count < minNotes) low.add(r.pubkey);
		}
		return low;
	});

	const filteredRecs = $derived.by(() => {
		let r = recs;
		if (minNotes > 0) r = r.filter(x => x.note_count >= minNotes);
		if (excludeFollows && $isSignedIn) r = r.filter(x => !$followList.has(x.pubkey));
		if (excludeMutes && $isSignedIn) r = r.filter(x => !$muteList.has(x.pubkey));
		if (excludePubkeys.length) r = r.filter(x => !excludePubkeys.includes(x.pubkey));
		if (blockedTerms.length) r = r.filter(x =>
			!matchesTerm(x.name) && !matchesTerm(x.nip05) && !matchesTerm(x.about)
		);
		if (reversePk) r = [...r].reverse();
		return r;
	});

	const filteredNotes = $derived.by(() => {
		let n = notes;
		if (minNotes > 0 && lowNoteAuthors.size > 0) n = n.filter(x => !lowNoteAuthors.has(x.pubkey));
		if (excludeFollows && $isSignedIn) n = n.filter(x => !$followList.has(x.pubkey));
		if (excludeMutes && $isSignedIn) n = n.filter(x => !$muteList.has(x.pubkey));
		if (excludePubkeys.length) n = n.filter(x => !excludePubkeys.includes(x.pubkey));
		if (blockedTerms.length) n = n.filter(x =>
			!matchesTerm(x.content) && !matchesTerm(x.author_name)
		);
		if (reverseNotes) n = [...n].reverse();
		return n;
	});

	const activeFilterCount = $derived(
		(excludeFollows ? 1 : 0) + (excludeMutes ? 1 : 0) +
		(minNotes > 0 ? 1 : 0) +
		excludePubkeys.length + blockedTerms.length
	);

	const headerSummary = $derived.by(() => {
		if (hasResults) return `${filteredRecs.length} pks, ${filteredNotes.length} notes`;
		return '';
	});

	async function run() {
		if (!pubkeyValid) return;
		loading = true;
		error = '';
		hasResults = false;
		const t0 = performance.now();

		try {
			const bounds = $poolBounds;
			const codename = $selectedCodename;
			const pk = effectivePk;

			const [recsResp, timelineResp] = await Promise.all([
				getUserRecs(pk, {
					codename, model,
					trust_min: trustMin, lambda,
					limit: pubkeyLimit,
					context: context || undefined,
					context_weight: context ? ctxWeight : undefined,
					reverse: reversePk || undefined,
					include_follows: excludeFollows ? undefined : true,
					exclude_pks: excludePubkeys.length ? excludePubkeys.join(',') : undefined
				}),
				getUserTimeline(pk, {
					codename,
					model: model === 'community' ? 'semantic' : model,
					trust_min: trustMin, lambda,
					limit: noteLimit,
					context: context || undefined,
					context_weight: context ? ctxWeight : undefined,
					reverse: reverseNotes || undefined,
					exclude_follows: excludeFollows || undefined,
					exclude_pks: excludePubkeys.length ? excludePubkeys.join(',') : undefined,
					pool_start: bounds.start, pool_end: bounds.end
				})
			]);

			recs = recsResp.recs;
			notes = timelineResp.notes;
			hasResults = true;
			elapsed = Math.round(performance.now() - t0);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// Navigate to Explore page with this user pre-loaded
	function reQueryAs(pk: string) {
		goto(`${base}/explore?pk=${hexToNpub(pk)}`);
	}
</script>

<div class="qcard" class:expanded>
	<!-- Card header -->
	<div class="qcard-header" role="button" tabindex="0"
		onclick={() => expanded = !expanded}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') expanded = !expanded; }}>
		<span class="qcard-expand">&#9654;</span>
		<input
			type="text" class="qcard-name" bind:value={name}
			placeholder="Untitled query"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		/>
		<span class="qcard-badge">{headerSummary}</span>
		<div class="qcard-actions">
			<button class="qcard-btn" title="Copy query"
				onclick={(e) => { e.stopPropagation(); onduplicate(getParams()); }}>&#10697;</button>
			<button class="qcard-btn delete-btn" title="Delete"
				onclick={(e) => { e.stopPropagation(); ondelete(); }}>&#10005;</button>
		</div>
	</div>

	{#if expanded}
		<div class="qcard-body">
			<!-- Config section -->
			<div class="qcard-section">
				<button class="section-toggle" class:open={configOpen}
					onclick={() => configOpen = !configOpen}>
					<span class="toggle-arrow">&#9654;</span>
					<span class="section-label">Query Parameters</span>
				</button>
				{#if configOpen}
					<div class="section-body">
						<div class="config-row" style="grid-template-columns: 1fr 1fr;">
							<PubkeyInput bind:value={pubkey} onresolved={(pk, v) => { effectivePk = pk; pubkeyValid = v; }} />
							<div class="config-field">
								<label>Ideas similar to</label>
								<input type="text" placeholder="bitcoin, privacy, open source..." bind:value={context} />
							</div>
						</div>
						<div class="config-row">
							<SliderField
								label="Trust floor"
								bind:value={trustMinRaw}
								min={0} max={100} step={1}
								displayValue={trustMin.toFixed(2)}
							/>
							<SliderField
								label="Trust weight"
								bind:value={lambdaRaw}
								min={0} max={50} step={1}
								displayValue={lambda.toFixed(1)}
							/>
							<div class="config-field">
								<div class="limits-row">
									<div>
										<label>Pubkey limit</label>
										<input type="number" bind:value={pubkeyLimit} min={1} max={500} />
									</div>
									<div>
										<label>Note limit</label>
										<input type="number" bind:value={noteLimit} min={1} max={500} />
									</div>
								</div>
							</div>
						</div>
						{#if context}
							<div class="config-row" style="grid-template-columns: 1fr 2fr;">
								<SliderField
									label="Concept bias"
									bind:value={contextWeight}
									min={0} max={10} step={1}
									displayValue={ctxWeight.toFixed(1)}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Filters section -->
			<div class="qcard-section">
				<button class="section-toggle" class:open={filtersOpen}
					onclick={() => filtersOpen = !filtersOpen}>
					<span class="toggle-arrow">&#9654;</span>
					<span class="section-label">Filters</span>
					{#if activeFilterCount > 0}
						<span class="filter-badge">{activeFilterCount}</span>
					{/if}
				</button>
				{#if filtersOpen}
					<div class="section-body">
						<FilterPanel
							bind:excludeFollows
							bind:excludeMutes
							bind:minNotes
							bind:excludePubkeys
							bind:blockedTerms
						/>
					</div>
				{/if}
			</div>

			<!-- Run button -->
			<button class="run-bar" onclick={run} disabled={!pubkeyValid || loading}>
				{#if loading}
					Running...
				{:else}
					&#9654; Run
				{/if}
			</button>

			<!-- Results -->
			<div class="qcard-results">
				{#if error}
					<div class="results-msg error">{error}</div>
				{:else if loading}
					<div class="results-msg">Loading...</div>
				{:else if hasResults}
					<div class="results-meta">
						{elapsed}ms &middot;
						G &ge; {trustMin.toFixed(2)} &middot;
						&lambda;={lambda.toFixed(1)}
						{#if activeFilterCount > 0}
							&middot; {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
						{/if}
					</div>
					<div class="results-grid">
						<div class="results-col">
							<button class="results-header snap-header" class:active={reversePk}
								onclick={() => reversePk = !reversePk}
								title={reversePk ? 'Showing least similar first' : 'Reverse order'}>
								<h4>Follows</h4>
								<span class="reverse-arrow">{reversePk ? '↑' : '↓'}</span>
								<span class="results-count">
									{filteredRecs.length}{filteredRecs.length !== recs.length ? `/${recs.length}` : ''}
								</span>
							</button>
							<div class="results-scroll">
								{#each filteredRecs as rec (rec.pubkey)}
									<div class="clickable-rec" role="button" tabindex="0"
										title="Re-query as this user"
										onclick={() => reQueryAs(rec.pubkey)}
										onkeydown={(e) => { if (e.key === 'Enter') reQueryAs(rec.pubkey); }}>
										<RecCard {rec} />
									</div>
								{:else}
									<div class="empty-msg">No recommendations</div>
								{/each}
							</div>
						</div>
						<div class="results-col">
							<button class="results-header pool-header" class:active={reverseNotes}
								onclick={() => reverseNotes = !reverseNotes}
								title={reverseNotes ? 'Showing least relevant first' : 'Reverse order'}>
								<h4>Notes</h4>
								<span class="reverse-arrow">{reverseNotes ? '↑' : '↓'}</span>
								<span class="results-count">
									{filteredNotes.length}{filteredNotes.length !== notes.length ? `/${notes.length}` : ''}
								</span>
							</button>
							<div class="results-scroll">
								{#each filteredNotes as note (note.id)}
									<div class="clickable-rec" role="button" tabindex="0"
										title="Explore this author"
										onclick={() => reQueryAs(note.pubkey)}
										onkeydown={(e) => { if (e.key === 'Enter') reQueryAs(note.pubkey); }}>
										<NoteCard {note} />
									</div>
								{:else}
									<div class="empty-msg">No notes</div>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<div class="results-msg hint">Set pubkey and click <strong>Run</strong></div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.qcard {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		transition: border-color 0.2s;
	}
	.qcard:hover { border-color: var(--border-light, #3a3a5a); }
	.qcard.expanded { border-color: var(--accent-dim); }

	/* Header */
	.qcard-header {
		display: flex;
		align-items: center;
		padding: 12px 16px;
		gap: 10px;
		cursor: pointer;
		user-select: none;
	}
	.qcard-header:hover { background: rgba(255,255,255,0.02); }

	.qcard-expand {
		color: var(--text-muted);
		font-size: 11px;
		transition: transform 0.2s;
		width: 14px;
		text-align: center;
		flex-shrink: 0;
	}
	.qcard.expanded .qcard-expand { transform: rotate(90deg); }

	.qcard-name {
		flex: 1;
		background: transparent;
		border: none;
		border-bottom: 1px solid transparent;
		color: var(--text-primary);
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		padding: 2px 0;
		outline: none;
	}
	.qcard-name:focus { border-bottom-color: var(--accent-dim); }
	.qcard-name::placeholder { color: var(--text-muted); }

	.qcard-badge {
		font-size: 10px;
		color: var(--text-muted);
		padding: 2px 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.qcard-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}
	.qcard-btn {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: 4px;
		font-size: 11px;
		font-family: inherit;
		padding: 4px 10px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.qcard-btn:hover {
		color: var(--text-secondary);
		border-color: var(--border-light, #3a3a5a);
	}
	.qcard-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.qcard-btn.delete-btn:hover {
		color: var(--tier-x, #e74c3c);
		border-color: var(--tier-x, #e74c3c);
	}

	/* Body */
	.qcard-body {
		border-top: 1px solid var(--border);
	}

	/* Collapsible sections */
	.qcard-section {
		border-bottom: 1px solid var(--border);
	}
	.section-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		background: transparent;
		border: none;
		color: inherit;
		cursor: pointer;
		user-select: none;
	}
	.section-toggle:hover { background: rgba(255,255,255,0.02); }
	.toggle-arrow {
		color: var(--text-muted);
		font-size: 10px;
		transition: transform 0.2s;
		width: 12px;
		text-align: center;
	}
	.section-toggle.open .toggle-arrow { transform: rotate(90deg); }
	.section-label {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}
	.filter-badge {
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 8px;
		background: rgba(243, 156, 18, 0.15);
		color: var(--warning, #f39c12);
	}
	.section-body {
		padding: 12px 16px 16px;
	}

	/* Run bar */
	.run-bar {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 12px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--border);
		color: var(--positive, #2ecc71);
		font-size: 12px;
		font-weight: 500;
		font-family: inherit;
		letter-spacing: 0.5px;
		cursor: pointer;
		transition: all 0.15s;
	}
	.run-bar:hover:not(:disabled) {
		background: rgba(46, 204, 113, 0.06);
	}
	.run-bar:disabled {
		color: var(--text-muted);
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Config layout */
	.config-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 14px;
		margin-bottom: 14px;
	}
	.config-field label {
		display: block;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 6px;
	}
	.config-field input[type="text"] {
		width: 100%;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px 10px;
		font-family: inherit;
		font-size: 12px;
		outline: none;
		transition: border-color 0.15s;
	}
	.config-field input[type="text"]:focus { border-color: var(--accent-dim); }
	.config-field input[type="text"]::placeholder { color: var(--text-muted); }
	.limits-row { display: flex; gap: 12px; }
	.limits-row > div { flex: 1; }
	.limits-row label {
		display: block;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 6px;
	}
	.limits-row input[type="number"] {
		width: 100%;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px 10px;
		font-family: inherit;
		font-size: 12px;
		outline: none;
	}

	/* Results */
	.qcard-results {
		background: rgba(0,0,0,0.1);
	}
	.results-msg {
		padding: 20px;
		text-align: center;
		font-size: 11px;
		color: var(--text-muted);
	}
	.results-msg.error { color: var(--tier-x, #e74c3c); }
	.results-msg.hint { color: var(--text-muted); }
	.results-meta {
		padding: 8px 16px;
		font-size: 10px;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
	}
	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 120px;
	}
	.results-col { min-width: 0; overflow: hidden; }
	.results-col:first-child { border-right: 1px solid var(--border); }
	.results-header {
		padding: 10px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border: none;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: inherit;
		font-family: inherit;
		width: 100%;
		cursor: pointer;
		transition: background 0.15s;
	}
	.results-header:hover {
		background: rgba(255,255,255,0.03);
	}
	.results-header h4 {
		font-size: 10px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.8px;
	}
	.snap-header h4 { color: var(--snap-color); }
	.pool-header h4 { color: var(--pool-color); }
	.reverse-arrow {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-muted);
		transition: color 0.15s;
	}
	.results-header.active .reverse-arrow {
		color: var(--warning, #f39c12);
	}
	.results-header:hover .reverse-arrow {
		color: var(--text-secondary);
	}
	.results-header.active:hover .reverse-arrow {
		color: var(--warning, #f39c12);
	}
	.results-count { font-size: 10px; color: var(--text-muted); }
	.results-scroll { max-height: 500px; overflow-y: auto; }
	.empty-msg {
		padding: 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 11px;
	}
	.clickable-rec { cursor: pointer; }
	.clickable-rec:hover { background: var(--accent-glow, rgba(79,195,247,0.08)); }

	@media (max-width: 900px) {
		.config-row { grid-template-columns: 1fr; }
		.results-grid { grid-template-columns: 1fr; }
		.results-col:first-child { border-right: none; border-bottom: 1px solid var(--border); }
	}
</style>
