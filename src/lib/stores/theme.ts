import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

const stored = browser ? (localStorage.getItem('trustr-theme') as Theme) : null;
export const theme = writable<Theme>(stored || 'dark');

if (browser) {
	theme.subscribe((t) => {
		document.documentElement.setAttribute('data-theme', t);
		localStorage.setItem('trustr-theme', t);
	});
}
