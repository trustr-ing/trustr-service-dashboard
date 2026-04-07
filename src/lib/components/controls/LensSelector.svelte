<script lang="ts">
    import { codenames, selectedCodename } from "$lib/stores/codename";

    function select(id: string) {
        $selectedCodename = id;
    }
</script>

<div class="lens-section">
    <div class="section-label">Lens</div>
    <div class="codename-chips">
        {#each $codenames as cn}
            <button
                class="codename-chip"
                class:selected={$selectedCodename === cn.id}
                onclick={() => select(cn.id)}
            >
                {#if cn.icon}<span class="codename-icon">{#if cn.icon.startsWith('<')}{@html cn.icon}{:else}{cn.icon}{/if}</span>{/if}
                <div class="codename-info">
                    <div class="codename-name">{cn.name}</div>
                    <!-- <div class="codename-desc">{cn.desc || `${cn.pubkeys.toLocaleString()} pubkeys`}</div> -->
                </div>
            </button>
        {/each}
    </div>
</div>

<style>
    .section-label {
        font-size: 10px;
        font-weight: 500;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 8px;
    }
    .codename-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    .codename-chip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
        position: relative;
        flex: 1;
        min-width: 140px;
        text-align: left;
        color: inherit;
    }
    .codename-chip:hover {
        border-color: var(--border-light);
    }
    .codename-chip.selected {
        border-color: var(--snap-dim);
        background: var(--snap-glow);
    }
    .codename-chip.selected::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--snap-color);
        border-radius: 8px 0 0 8px;
    }
    .codename-icon {
        font-size: 22px;
        line-height: 1;
        flex-shrink: 0;
        font-family: serif;
        color: #e53935;
        font-weight: 700;
    }
    .codename-info {
        flex: 1;
        min-width: 0;
    }
    .codename-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .codename-desc {
        font-size: 10px;
        color: var(--text-muted);
        margin-top: 2px;
    }
</style>
