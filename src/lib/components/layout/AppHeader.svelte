<script lang="ts">
    import { base } from "$app/paths";
    import { page } from "$app/state";
    import { theme } from "$lib/stores/theme";
    import { pubkey, profile, isSignedIn, signerLoading, signerError, signIn } from "$lib/stores/signer";
    import TrustrLogo from "$lib/components/viz/TrustrLogo.svelte";
    import ProfilePanel from "$lib/components/layout/ProfilePanel.svelte";

    let profileOpen = $state(false);

    const links = [
        { href: `${base}/query`, label: "query" },
        { href: `${base}/explore`, label: "explore" },
        { href: `${base}/scatter`, label: "scatter" },
    ];

    const currentPath = $derived(page.url?.pathname ?? "");
    const shortPubkey = $derived($pubkey ? $pubkey.slice(0, 8) + '...' : '');

    function toggleTheme() {
        theme.update((t) => (t === "dark" ? "light" : "dark"));
    }
</script>

<header>
    <nav class="nav-left">
        {#each links as link}
            <a
                href={link.href}
                class="nav-link"
                class:active={currentPath.startsWith(link.href)}>{link.label}</a
            >
        {/each}
    </nav>
    <a href="{base}/" class="logo">
        <div class="logo-top">
            <TrustrLogo width={43} height={38} compact />
            <h1>NDE</h1>
        </div>
        <span class="logo-sub">Revive Your Feed</span>
    </a>
    <div class="nav-right">
        {#if $isSignedIn}
            <button class="signed-in-pk" title={$pubkey ?? ''} onclick={() => profileOpen = true}>
                {#if $profile?.picture}
                    <img class="header-avatar" src={$profile.picture} alt=""
                        onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {/if}
                {$profile?.name || shortPubkey}
            </button>
        {:else}
            <button class="sign-btn" onclick={signIn} disabled={$signerLoading}>
                {$signerLoading ? '...' : 'sign in'}
            </button>
        {/if}
        <button class="theme-toggle" onclick={toggleTheme} title="Toggle theme">
            {$theme === "dark" ? "☀" : "☽"}
        </button>
    </div>
    {#if $signerError}
        <div class="signer-error">{$signerError}</div>
    {/if}
</header>

<ProfilePanel bind:open={profileOpen} />

<style>
    header {
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border);
        padding: 12px 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: sticky;
        top: 0;
        z-index: 100;
    }
    .logo {
        text-decoration: none;
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    .logo-top {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    h1 {
        font-size: 20px;
        font-weight: 400;
        color: var(--accent);
        letter-spacing: 3px;
        line-height: 1;
    }
    .logo-sub {
        font-size: 8px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--text-muted);
        margin-top: 2px;
    }
    .nav-left,
    .nav-right {
        display: flex;
        gap: 8px;
        flex: 1;
    }
    .nav-left {
        justify-content: flex-start;
    }
    .nav-right {
        justify-content: flex-end;
    }
    .nav-link {
        color: var(--text-muted);
        font-size: 11px;
        padding: 4px 10px;
        border: 1px solid var(--border);
        border-radius: 4px;
        transition: all 0.15s;
    }
    .nav-link:hover {
        color: var(--text-secondary);
        border-color: var(--border-light);
    }
    .nav-link.active {
        color: var(--accent);
        border-color: var(--accent-dim);
        background: var(--accent-glow);
    }
    .theme-toggle {
        color: var(--text-muted);
        font-size: 14px;
        padding: 4px 8px;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: none;
        transition: all 0.15s;
        line-height: 1;
    }
    .theme-toggle:hover {
        color: var(--text-secondary);
        border-color: var(--border-light);
    }
    .signed-in-pk {
        font-size: 10px;
        color: var(--accent);
        font-family: 'JetBrains Mono', monospace;
        padding: 4px 10px 4px 4px;
        border: 1px solid var(--accent-dim);
        border-radius: 4px;
        background: var(--accent-glow);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
    }
    .signed-in-pk:hover {
        border-color: var(--accent);
    }
    .header-avatar {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        object-fit: cover;
    }
    .sign-btn {
        font-size: 11px;
        padding: 4px 10px;
        border: 1px solid var(--border);
        border-radius: 4px;
        background: none;
        color: var(--text-muted);
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
    }
    .sign-btn:hover:not(:disabled) {
        color: var(--accent);
        border-color: var(--accent-dim);
    }
    .sign-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }
    .signer-error {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #2a1a0a;
        color: #f0a050;
        text-align: center;
        padding: 4px 12px;
        font-size: 11px;
    }
</style>
