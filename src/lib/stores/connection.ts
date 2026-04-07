import { writable } from 'svelte/store';

export const apiAvailable = writable<boolean>(true);
