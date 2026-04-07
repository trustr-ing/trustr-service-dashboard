<script lang="ts">
	import { parseToHex, hexToNpub } from '$lib/utils/pubkey';
	import { pubkey as signerPubkey, isSignedIn, profile } from '$lib/stores/signer';

	let { value = $bindable(''), onresolved }:
		{ value: string; onresolved?: (pk: string, valid: boolean) => void } = $props();

	let touched = $state(false);

	// If signed in and input empty, use signer pubkey
	const usingDefault = $derived($isSignedIn && value === '');

	const resolvedHex = $derived.by(() => {
		if (usingDefault) return $signerPubkey;
		if (value === '') return null;
		return parseToHex(value);
	});

	const isValid = $derived(resolvedHex !== null && resolvedHex.length === 64);

	// Notify parent whenever resolved value changes
	$effect(() => {
		onresolved?.(isValid ? resolvedHex! : '', isValid);
	});

	const signerNpub = $derived($signerPubkey ? hexToNpub($signerPubkey) : '');

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value.trim();
		touched = true;
	}

	function clearOverride() {
		value = '';
		touched = false;
	}
</script>

<div class="pubkey-field">
	<label>
		{#if usingDefault}
			Pubkey <span class="default-badge">signed in{$profile?.name ? ` as ${$profile.name}` : ''}</span>
		{:else}
			Pubkey (npub or hex)
		{/if}
	</label>
	<div class="input-wrap">
		<input
			type="text"
			placeholder={$isSignedIn ? (signerNpub.slice(0, 20) + '...') : 'npub1... or hex'}
			spellcheck="false"
			value={value}
			oninput={handleInput}
			class:invalid={touched && !isValid && value.length > 0}
			class:using-default={usingDefault}
		/>
		{#if value !== '' && $isSignedIn}
			<button class="clear-btn" onclick={clearOverride} title="Use signed-in pubkey">&times;</button>
		{/if}
	</div>
</div>

<style>
	.pubkey-field label {
		display: block;
		font-size: 11px;
		color: var(--text-secondary);
		margin-bottom: 6px;
	}
	.default-badge {
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 8px;
		background: var(--accent-glow);
		color: var(--accent);
		margin-left: 4px;
		font-weight: 500;
	}
	.input-wrap {
		position: relative;
	}
	input {
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
	input.using-default {
		border-color: var(--accent-dim);
		background: rgba(79, 195, 247, 0.04);
	}
	input:focus {
		border-color: var(--accent-dim);
	}
	input::placeholder {
		color: var(--text-muted);
	}
	input.invalid {
		border-color: var(--tier-x);
	}
	.clear-btn {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 14px;
		cursor: pointer;
		padding: 2px 6px;
		line-height: 1;
	}
	.clear-btn:hover {
		color: var(--accent);
	}
</style>
