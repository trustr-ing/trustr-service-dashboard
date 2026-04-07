<script lang="ts">
	import { pubkey, profile, followList, muteList, writeRelays, signOut } from '$lib/stores/signer';
	import { hexToNpub } from '$lib/utils/pubkey';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const npub = $derived($pubkey ? hexToNpub($pubkey) : '');
	const shortNpub = $derived(npub ? npub.slice(0, 16) + '...' + npub.slice(-6) : '');

	function close() {
		open = false;
	}

	function handleSignOut() {
		signOut();
		open = false;
	}

	function copyNpub() {
		if (npub) navigator.clipboard.writeText(npub);
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={close} onkeydown={close}></div>
	<aside class="panel">
		<button class="close-btn" onclick={close}>&times;</button>

		<div class="profile-section">
			{#if $profile?.banner}
				<div class="banner" style="background-image: url({$profile.banner})"></div>
			{:else}
				<div class="banner banner-empty"></div>
			{/if}

			<div class="avatar-row">
				{#if $profile?.picture}
					<img
						class="avatar"
						src={$profile.picture}
						alt=""
						onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
					/>
				{:else}
					<div class="avatar avatar-placeholder"></div>
				{/if}
			</div>

			<div class="name">
				{$profile?.display_name || $profile?.name || shortNpub}
			</div>
			{#if $profile?.name && $profile?.display_name}
				<div class="username">@{$profile.name}</div>
			{/if}
			{#if $profile?.nip05}
				<div class="nip05">{$profile.nip05}</div>
			{/if}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="npub" onclick={copyNpub} title="Click to copy npub">
				{shortNpub}
			</div>
		</div>

		{#if $profile?.about}
			<div class="about">{$profile.about}</div>
		{/if}

		<div class="stats-grid">
			<div class="stat-item">
				<span class="stat-val">{$followList.size}</span>
				<span class="stat-label">following</span>
			</div>
			<div class="stat-item">
				<span class="stat-val">{$muteList.size}</span>
				<span class="stat-label">muted</span>
			</div>
			<div class="stat-item">
				<span class="stat-val">{$writeRelays.length}</span>
				<span class="stat-label">relays</span>
			</div>
		</div>

		{#if $writeRelays.length > 0}
			<div class="relay-section">
				<h4>Write Relays</h4>
				<ul class="relay-list">
					{#each $writeRelays as relay}
						<li>{relay.replace('wss://', '')}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if $profile?.lud16}
			<div class="detail-row">
				<span class="detail-label">lightning</span>
				<span class="detail-val">{$profile.lud16}</span>
			</div>
		{/if}

		{#if $profile?.website}
			<div class="detail-row">
				<span class="detail-label">web</span>
				<a class="detail-val detail-link" href={$profile.website} target="_blank" rel="noopener">
					{$profile.website.replace(/^https?:\/\//, '')}
				</a>
			</div>
		{/if}

		<div class="panel-footer">
			<button class="sign-out-btn" onclick={handleSignOut}>Sign Out</button>
		</div>
	</aside>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 340px;
		max-width: 90vw;
		background: var(--bg-surface);
		border-left: 1px solid var(--border);
		z-index: 201;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		animation: slide-in 0.2s ease-out;
	}
	@keyframes slide-in {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}
	.close-btn {
		position: absolute;
		top: 8px;
		right: 12px;
		background: rgba(0, 0, 0, 0.4);
		border: none;
		color: var(--text-secondary);
		font-size: 20px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		cursor: pointer;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}
	.close-btn:hover {
		background: rgba(0, 0, 0, 0.6);
		color: var(--text-primary);
	}

	.profile-section {
		text-align: center;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border);
	}
	.banner {
		height: 100px;
		background-size: cover;
		background-position: center;
		border-bottom: 1px solid var(--border);
	}
	.banner-empty {
		background: linear-gradient(135deg, var(--accent-dim) 0%, var(--bg-elevated) 100%);
	}
	.avatar-row {
		display: flex;
		justify-content: center;
		margin-top: -32px;
		margin-bottom: 10px;
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		border: 3px solid var(--bg-surface);
		background: var(--bg-elevated);
	}
	.avatar-placeholder {
		background: var(--bg-elevated);
	}
	.name {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
		padding: 0 16px;
	}
	.username {
		font-size: 12px;
		color: var(--text-muted);
		margin-top: 2px;
	}
	.nip05 {
		font-size: 11px;
		color: var(--accent);
		margin-top: 4px;
	}
	.npub {
		font-size: 10px;
		color: var(--text-muted);
		font-family: 'JetBrains Mono', monospace;
		margin-top: 6px;
		cursor: pointer;
		transition: color 0.15s;
	}
	.npub:hover {
		color: var(--accent);
	}

	.about {
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.6;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		text-align: center;
	}
	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stat-val {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.stat-label {
		font-size: 10px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.relay-section {
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}
	.relay-section h4 {
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}
	.relay-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.relay-list li {
		font-size: 11px;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', monospace;
		padding: 4px 8px;
		background: var(--bg-elevated);
		border-radius: 4px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
	}
	.detail-label {
		font-size: 10px;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.detail-val {
		font-size: 11px;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', monospace;
	}
	.detail-link {
		color: var(--accent);
		text-decoration: none;
	}
	.detail-link:hover {
		text-decoration: underline;
	}

	.panel-footer {
		padding: 16px;
		margin-top: auto;
	}
	.sign-out-btn {
		width: 100%;
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: none;
		color: var(--text-muted);
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}
	.sign-out-btn:hover {
		color: #f06060;
		border-color: #f06060;
	}
</style>
