export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

function getApiBase(): string {
	return import.meta.env.VITE_API_BASE || window.__TRUSTR_API_BASE__ || window.location.origin;
}

export async function apiFetch<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
	const url = new URL(path, getApiBase());
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v != null && v !== '') {
				url.searchParams.set(k, String(v));
			}
		}
	}
	const resp = await fetch(url.toString());
	if (!resp.ok) {
		const text = await resp.text();
		throw new ApiError(resp.status, `${resp.status}: ${text}`);
	}
	return resp.json();
}

export async function apiPost<T>(path: string, body: unknown, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
	const url = new URL(path, getApiBase());
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v != null && v !== '') {
				url.searchParams.set(k, String(v));
			}
		}
	}
	const resp = await fetch(url.toString(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new ApiError(resp.status, `${resp.status}: ${text}`);
	}
	return resp.json();
}
