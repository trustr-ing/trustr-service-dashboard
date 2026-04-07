import { writable } from 'svelte/store';
import type { Codename } from '$lib/api/types';

export const codenames = writable<Codename[]>([]);
export const selectedCodename = writable<string>('');
