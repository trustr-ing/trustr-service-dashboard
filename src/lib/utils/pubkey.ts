import { nip19 } from 'nostr-tools';

const HEX64_RE = /^[0-9a-f]{64}$/;

export function isValidPk(pk: string): boolean {
	return HEX64_RE.test(pk.trim().toLowerCase());
}

/** Accept hex or npub/nprofile, return hex pubkey or null */
export function parseToHex(input: string): string | null {
	const trimmed = input.trim();
	if (HEX64_RE.test(trimmed.toLowerCase())) return trimmed.toLowerCase();
	try {
		const decoded = nip19.decode(trimmed);
		if (decoded.type === 'npub') return decoded.data;
		if (decoded.type === 'nprofile') return decoded.data.pubkey;
	} catch { /* not a valid bech32 */ }
	return null;
}

export function hexToNpub(hex: string): string {
	return nip19.npubEncode(hex);
}
