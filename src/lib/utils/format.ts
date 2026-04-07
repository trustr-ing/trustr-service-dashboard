export function fmtNum(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return n.toLocaleString();
}

export function fmtDate(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function fmtDateShort(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric'
	});
}

export function fmtDateTime(ts: number): string {
	return new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

export function truncatePk(pk: string, len = 12): string {
	return pk.slice(0, len) + '...';
}
