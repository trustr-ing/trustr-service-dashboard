<script lang="ts">
	import '../app.css';
	import AppHeader from '$lib/components/layout/AppHeader.svelte';
	import TrustrLogo from '$lib/components/viz/TrustrLogo.svelte';
	import { codenames, selectedCodename } from '$lib/stores/codename';
	import { shelfStats, initPoolFromStats } from '$lib/stores/pool';
	import { apiAvailable } from '$lib/stores/connection';
	import { getCodenames, getShelfStats } from '$lib/api/endpoints';
	import { onMount } from 'svelte';

	let { children } = $props();
	let dataLoaded = $state(false);
	let minTimeElapsed = $state(false);
	let fading = $state(false);
	let showApp = $state(false);

	const MIN_SPLASH_MS = 5200;

	function skipSplash() {
		if (fading || !dataLoaded) return;
		minTimeElapsed = true;
		fading = true;
		setTimeout(() => { showApp = true; }, 300);
	}

	onMount(async () => {
		const splashTimer = new Promise<void>(r => setTimeout(r, MIN_SPLASH_MS));

		try {
			const [cnResp, statsResp] = await Promise.all([
				getCodenames(),
				getShelfStats()
			]);
			$codenames = cnResp.codenames;
			if (cnResp.default) {
				$selectedCodename = cnResp.default;
			} else if (cnResp.codenames.length > 0) {
				$selectedCodename = cnResp.codenames[0].id;
			}
			if (statsResp.available) {
				$shelfStats = statsResp;
				initPoolFromStats(statsResp);
			}
		} catch (err) {
			console.error('Failed to load initial data:', err);
			$apiAvailable = false;
		}
		dataLoaded = true;

		await splashTimer;
		if (!fading) {
			minTimeElapsed = true;
			fading = true;
			setTimeout(() => { showApp = true; }, 500);
		}
	});
</script>

{#if showApp}
	{#if !$apiAvailable}
		<div class="api-banner">API unavailable — running in offline mode</div>
	{/if}
	<AppHeader />
	<main>
		{@render children()}
	</main>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="splash" class:fading
		onclick={skipSplash}
		onkeydown={skipSplash}>
		<TrustrLogo width={200} height={200} />
	</div>
{/if}

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 24px;
	}
	.splash {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		opacity: 1;
		transition: opacity 0.5s ease-out;
	}
	.splash.fading {
		opacity: 0;
	}
	.api-banner {
		background: #2a1a0a;
		color: #f0a050;
		text-align: center;
		padding: 6px 12px;
		font-size: 0.85rem;
		font-family: 'JetBrains Mono', monospace;
	}
</style>
