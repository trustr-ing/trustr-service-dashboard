import { writable, derived } from 'svelte/store';
import { SimplePool } from 'nostr-tools/pool';
import { getPublicContacts } from 'applesauce-core/helpers/contacts';
import { getOutboxes } from 'applesauce-core/helpers/mailboxes';
import { getProfileContent, type ProfileContent } from 'applesauce-core/helpers/profile';
import type { NostrEvent } from 'nostr-tools/pure';

const FALLBACK_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://theforest.nostr1.com',
];

const FETCH_TIMEOUT_MS = 8000;

export const pubkey = writable<string | null>(null);
export const profile = writable<ProfileContent | null>(null);
export const writeRelays = writable<string[]>([]);
export const followList = writable<Set<string>>(new Set());
export const muteList = writable<Set<string>>(new Set());
export const signerLoading = writable(false);
export const signerError = writable<string | null>(null);

export const isSignedIn = derived(pubkey, ($pk) => $pk !== null);

let pool: SimplePool | null = null;

function getPool(): SimplePool {
    if (!pool) pool = new SimplePool();
    return pool;
}

/** Fetch a single replaceable event by kind + author from relays */
async function fetchReplaceable(
    relays: string[],
    kind: number,
    author: string,
): Promise<NostrEvent | null> {
    const p = getPool();
    try {
        const event = await Promise.race([
            p.get(relays, { kinds: [kind], authors: [author] }),
            new Promise<null>((r) => setTimeout(() => r(null), FETCH_TIMEOUT_MS)),
        ]);
        return event;
    } catch {
        return null;
    }
}

/** Get the user's write (outbox) relays from kind 10002, falling back to defaults */
async function getWriteRelays(pk: string): Promise<string[]> {
    const mailboxEvent = await fetchReplaceable(FALLBACK_RELAYS, 10002, pk);
    if (mailboxEvent) {
        const outboxes = getOutboxes(mailboxEvent);
        if (outboxes.length > 0) return outboxes;
    }
    return FALLBACK_RELAYS;
}

/** Extract muted pubkeys from a kind 10000 event (public tags + encrypted content) */
async function parseMuteList(event: NostrEvent): Promise<Set<string>> {
    const muted = new Set<string>();
    // Public p tags
    for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
            muted.add(tag[1]);
        }
    }
    // Encrypted content (NIP-44) — mutes are often stored privately
    if (event.content) {
        console.log('[signer] mute event has encrypted content, length:', event.content.length);
        console.log('[signer] nip44 available:', !!window.nostr?.nip44);
        console.log('[signer] nip04 available:', !!window.nostr?.nip04);
        console.log('[signer] public p tags found:', muted.size);

        let decrypted: string | null = null;

        // Try NIP-44 first
        if (!decrypted && window.nostr?.nip44) {
            try {
                console.log('[signer] trying nip44 decrypt...');
                const result = await window.nostr.nip44.decrypt(event.pubkey, event.content);
                if (typeof result === 'string' && result.length > 0) {
                    decrypted = result;
                } else {
                    console.warn('[signer] nip44 returned non-string:', result);
                }
            } catch (err) {
                console.warn('[signer] nip44 decrypt failed:', err);
            }
        }

        // Fall back to NIP-04
        if (!decrypted && window.nostr?.nip04) {
            try {
                console.log('[signer] trying nip04 decrypt...');
                const result = await window.nostr.nip04.decrypt(event.pubkey, event.content);
                if (typeof result === 'string' && result.length > 0) {
                    decrypted = result;
                } else {
                    console.warn('[signer] nip04 returned non-string:', result);
                }
            } catch (err) {
                console.warn('[signer] nip04 decrypt failed:', err);
            }
        }

        if (decrypted) {
            try {
                console.log('[signer] decrypted mute content:', decrypted.slice(0, 200));
                const tags: string[][] = JSON.parse(decrypted);
                console.log('[signer] decrypted tags count:', tags.length);
                for (const tag of tags) {
                    if (tag[0] === 'p' && tag[1]) {
                        muted.add(tag[1]);
                    }
                }
            } catch (err) {
                console.warn('[signer] failed to parse decrypted mute list:', err);
            }
        } else {
            console.warn('[signer] could not decrypt mute list with any method');
        }
    }
    return muted;
}

/** Sign in via NIP-07 extension, then fetch follow + mute lists */
export async function signIn(): Promise<void> {
    if (!window.nostr) {
        signerError.set('No NIP-07 extension found. Install nos2x, Alby, or similar.');
        return;
    }

    signerLoading.set(true);
    signerError.set(null);

    try {
        const pk = await window.nostr.getPublicKey();
        console.log('[signer] got pubkey:', pk);
        pubkey.set(pk);

        const userRelays = await getWriteRelays(pk);
        console.log('[signer] write relays:', userRelays);
        writeRelays.set(userRelays);

        console.log('[signer] fetching kind 0, 3, 10000...');
        const [profileEvent, contactsEvent, muteEvent] = await Promise.all([
            fetchReplaceable(userRelays, 0, pk),
            fetchReplaceable(userRelays, 3, pk),
            fetchReplaceable(userRelays, 10000, pk),
        ]);

        console.log('[signer] profile:', profileEvent ? 'found' : 'not found');
        console.log('[signer] contacts:', contactsEvent ? `found (${contactsEvent.tags.length} tags)` : 'not found');
        console.log('[signer] mute:', muteEvent ? `found (${muteEvent.tags.length} tags)` : 'not found');

        if (profileEvent) {
            const content = getProfileContent(profileEvent);
            if (content) profile.set(content);
        }

        if (contactsEvent) {
            const contacts = getPublicContacts(contactsEvent);
            console.log(`[signer] follows: ${contacts.length}`);
            followList.set(new Set(contacts.map((c) => c.pubkey)));
        }

        if (muteEvent) {
            const muted = await parseMuteList(muteEvent);
            console.log(`[signer] mute list: ${muted.size} pubkeys`, [...muted]);
            muteList.set(muted);
        }
    } catch (err) {
        console.error('[signer] error:', err);
        const msg = err instanceof Error ? err.message : 'Sign-in failed';
        signerError.set(msg);
        pubkey.set(null);
    } finally {
        signerLoading.set(false);
    }
}

export function signOut(): void {
    pubkey.set(null);
    profile.set(null);
    writeRelays.set([]);
    followList.set(new Set());
    muteList.set(new Set());
    signerError.set(null);
}
