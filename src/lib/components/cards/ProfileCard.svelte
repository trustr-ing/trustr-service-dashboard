<script lang="ts">
	import type { UserProfile } from '$lib/api/types';
	import { hexToNpub } from '$lib/utils/pubkey';

	let { profile }: { profile: UserProfile } = $props();

	const shortNpub = $derived(hexToNpub(profile.pubkey).slice(0, 16) + '...');
</script>

<div class="profile-card">
	<div class="pc-header">
		{#if profile.picture}
			<img
				class="pc-avatar"
				src={profile.picture}
				alt=""
				onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
			/>
		{/if}
		<div class="pc-info">
			<div class="pc-name">{profile.name || shortNpub}</div>
			{#if profile.nip05}
				<div class="pc-nip05">{profile.nip05}</div>
			{/if}
			<div class="pc-pk">{shortNpub}</div>
		</div>
	</div>
	{#if profile.about}
		<div class="pc-about">{profile.about}</div>
	{/if}
	<div class="pc-stats">
		<div class="stat">G <span class="val">{profile.g_score.toFixed(3)}</span></div>
		<div class="stat">notes <span class="val">{profile.note_count}</span></div>
		<div class="stat">following <span class="val">{profile.following_count}</span></div>
		{#if profile.alpha != null}
			<div class="stat">alpha <span class="val">{profile.alpha.toFixed(3)}</span></div>
		{/if}
		<div class="stat">zaps <span class="val">{profile.engagement.zaps_in_sats.toLocaleString()} sats</span></div>
	</div>
</div>

<style>
	.profile-card {
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}
	.pc-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 8px;
	}
	.pc-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--bg-card);
	}
	.pc-info { min-width: 0; }
	.pc-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.pc-nip05 {
		font-size: 10px;
		color: var(--accent);
	}
	.pc-pk {
		font-size: 10px;
		color: var(--text-muted);
		font-family: monospace;
	}
	.pc-about {
		font-size: 11px;
		color: var(--text-secondary);
		line-height: 1.5;
		margin-bottom: 8px;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}
	.pc-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		font-size: 10px;
		color: var(--text-muted);
	}
	.pc-stats .val {
		color: var(--text-secondary);
		font-weight: 500;
	}
</style>
