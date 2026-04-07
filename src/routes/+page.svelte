<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	onMount(() => {
		goto(`${base}/query`, { replaceState: true });
	});
</script>

<p>Redirecting...</p>
