<script lang="ts">
	import { followList, muteList, isSignedIn } from '$lib/stores/signer';

	let {
		excludeFollows = $bindable(true),
		excludeMutes = $bindable(true),
		minNotes = $bindable(30),
		excludePubkeys = $bindable<string[]>([]),
		blockedTerms = $bindable<string[]>([]),
	}: {
		excludeFollows: boolean;
		excludeMutes: boolean;
		minNotes: number;
		excludePubkeys: string[];
		blockedTerms: string[];
	} = $props();

	let excludeInput = $state('');
	let termInput = $state('');

	function addExcludePk() {
		const raw = excludeInput.trim().toLowerCase();
		if (!raw || raw.length < 8) return;
		if (!excludePubkeys.includes(raw)) {
			excludePubkeys = [...excludePubkeys, raw];
		}
		excludeInput = '';
	}

	function removeExcludePk(pk: string) {
		excludePubkeys = excludePubkeys.filter(p => p !== pk);
	}

	function addBlockedTerm() {
		const raw = termInput.trim().toLowerCase();
		if (!raw || raw.length < 2) return;
		if (!blockedTerms.includes(raw)) {
			blockedTerms = [...blockedTerms, raw];
		}
		termInput = '';
	}

	function removeBlockedTerm(term: string) {
		blockedTerms = blockedTerms.filter(t => t !== term);
	}

	function handleExcludeKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); addExcludePk(); }
	}

	function handleTermKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); addBlockedTerm(); }
	}
</script>

<div class="filter-panel">
	<!-- Toggles row -->
	<div class="toggle-row">
		<label class="toggle-label">
			<input type="checkbox" bind:checked={excludeFollows} />
			Exclude follows
			{#if $isSignedIn}<span class="list-count">{$followList.size}</span>{/if}
		</label>
		<label class="toggle-label">
			<input type="checkbox" bind:checked={excludeMutes} />
			Exclude mutes
			{#if $isSignedIn}<span class="list-count">{$muteList.size}</span>{/if}
		</label>
	</div>
	{#if !$isSignedIn && (excludeFollows || excludeMutes)}
		<div class="signer-hint">Sign in to use your follow &amp; mute lists from relays</div>
	{/if}

	<!-- Min notes -->
	<div class="min-notes-row">
		<label class="filter-label">Min notes per author</label>
		<input
			type="number"
			class="min-notes-input"
			bind:value={minNotes}
			min={0} max={1000} step={5}
		/>
	</div>

	<!-- Exclude pubkeys -->
	<div class="filter-group">
		<label class="filter-label">Exclude pubkeys</label>
		<div class="input-row">
			<input
				type="text"
				class="filter-input"
				placeholder="hex pubkey..."
				bind:value={excludeInput}
				onkeydown={handleExcludeKeydown}
				spellcheck="false"
			/>
			<button class="filter-add-btn" onclick={addExcludePk}>+ Add</button>
		</div>
		{#if excludePubkeys.length > 0}
			<div class="chip-list">
				{#each excludePubkeys as pk}
					<span class="chip">
						<code>{pk.slice(0, 8)}...{pk.slice(-4)}</code>
						<button class="chip-remove" onclick={() => removeExcludePk(pk)}>&times;</button>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Blocked terms -->
	<div class="filter-group">
		<label class="filter-label">Block terms <span class="filter-hint">hides profiles &amp; notes matching these words</span></label>
		<div class="input-row">
			<input
				type="text"
				class="filter-input"
				placeholder="keyword..."
				bind:value={termInput}
				onkeydown={handleTermKeydown}
			/>
			<button class="filter-add-btn" onclick={addBlockedTerm}>+ Add</button>
		</div>
		{#if blockedTerms.length > 0}
			<div class="chip-list">
				{#each blockedTerms as term}
					<span class="chip term-chip">
						<code>{term}</code>
						<button class="chip-remove" onclick={() => removeBlockedTerm(term)}>&times;</button>
					</span>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.filter-panel {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.toggle-row {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
	}
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-secondary);
		cursor: pointer;
		user-select: none;
	}
	.toggle-label input[type="checkbox"] {
		accent-color: var(--accent);
		width: 14px;
		height: 14px;
		cursor: pointer;
	}
	.list-count {
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 8px;
		background: var(--accent-glow);
		color: var(--accent);
		font-weight: 500;
	}
	.signer-hint {
		font-size: 10px;
		color: var(--text-muted);
		font-style: italic;
		padding: 4px 0;
	}
	.min-notes-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.min-notes-input {
		width: 70px;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 8px;
		font-family: inherit;
		font-size: 11px;
		outline: none;
		transition: border-color 0.15s;
	}
	.min-notes-input:focus {
		border-color: var(--accent-dim);
	}
	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.filter-label {
		font-size: 11px;
		color: var(--text-secondary);
	}
	.filter-hint {
		color: var(--text-muted);
		font-size: 10px;
	}
	.input-row {
		display: flex;
		gap: 6px;
	}
	.filter-input {
		flex: 1;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 10px;
		font-family: inherit;
		font-size: 11px;
		outline: none;
		transition: border-color 0.15s;
	}
	.filter-input:focus {
		border-color: var(--accent-dim);
	}
	.filter-input::placeholder {
		color: var(--text-muted);
	}
	.filter-add-btn {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		border-radius: 4px;
		padding: 0 12px;
		font-family: inherit;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}
	.filter-add-btn:hover {
		color: var(--accent);
		border-color: var(--accent-dim);
	}
	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 10px;
		color: var(--text-secondary);
	}
	.chip code {
		font-family: inherit;
		color: var(--text-muted);
	}
	.term-chip code {
		color: var(--warning, #f39c12);
	}
	.chip-remove {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 12px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		transition: color 0.15s;
	}
	.chip-remove:hover {
		color: var(--tier-x, #e74c3c);
	}
</style>
