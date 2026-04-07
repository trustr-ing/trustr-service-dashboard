<script lang="ts">
	import { onMount } from 'svelte';
	import { selectedCodename } from '$lib/stores/codename';
	import { theme } from '$lib/stores/theme';
	import { getProjectionPoints, getProjectionMeta, getProjectionNeighbors } from '$lib/api/endpoints';
	import { truncatePk, fmtNum } from '$lib/utils/format';
	import type { ProjectionPoint, ProjectionMeta, NeighborEntry } from '$lib/api/types';
	import { pubkey as signerPubkey, isSignedIn } from '$lib/stores/signer';

	function cssVar(name: string): string {
		return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	}

	// State
	let meta = $state<ProjectionMeta | null>(null);
	let points = $state<ProjectionPoint[]>([]);
	let loading = $state(true);
	let error = $state('');

	// Controls
	let projection = $state<'pca' | 'umap'>('umap');
	let colorBy = $state<string>('community');
	let connectBy = $state<string>('none');
	let nearestK = $state(8);
	let search = $state('');
	let plotDiv = $state<HTMLDivElement | null>(null);
	let plotlyReady = $state(false);
	let Plotly: any = null;

	// Neighbor connections loaded from server (all modes use this)
	let neighborMap = $state<Record<string, NeighborEntry[]>>({});
	let edgesLoading = $state(false);

	// Pin overlay state
	interface Pin { idx: number; x: number; y: number; }
	let pins = $state<Pin[]>([]);
	let hoveredIdx = $state<number | null>(null);
	let showMe = $state(false);
	let layoutVersion = $state(0);
	let relayoutRaf = 0;

	const meIdx = $derived.by(() => {
		if (!$isSignedIn || !$signerPubkey) return -1;
		return points.findIndex(p => p.pk_full === $signerPubkey);
	});

	// Non-reactive ref to the plot div for coordinate conversion
	let plotEl: HTMLDivElement | null = null;
	let initialRange = { xSpan: 1, ySpan: 1 };
	const BASE_SIZE = 2; // marker size at full zoom-out

	function dataToPixel(xVal: number, yVal: number): { x: number; y: number } | null {
		if (!plotEl || !(plotEl as any)._fullLayout) return null;
		const fl = (plotEl as any)._fullLayout;
		const xa = fl.xaxis;
		const ya = fl.yaxis;
		return {
			x: xa._offset + xa.l2p(xVal),
			y: ya._offset + ya.l2p(yVal),
		};
	}

	function taperPoly(ax: number, ay: number, nx: number, ny: number): string {
		const dx = nx - ax;
		const dy = ny - ay;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 8) return '';
		const px = -dy / len;
		const py = dx / len;
		return `${ax + px * 4},${ay + py * 4} ${nx + px * 1},${ny + py * 1} ${nx - px * 1},${ny - py * 1} ${ax - px * 4},${ay - py * 4}`;
	}

	interface OverlayItem {
		point: ProjectionPoint;
		idx: number;
		nodeX: number; nodeY: number;
		cardX: number; cardY: number;
		isPinned: boolean; isMe: boolean; isHover: boolean;
		taper: string;
		color: string;
	}

	const hasActivePreviews = $derived(
		hoveredIdx !== null || pins.length > 0 || (showMe && meIdx >= 0)
	);

	const overlays = $derived.by(() => {
		if (!hasActivePreviews) return [] as OverlayItem[];
		void layoutVersion;
		if (!plotlyReady || points.length === 0) return [] as OverlayItem[];

		const xKey = projection === 'umap' ? 'umap_x' : 'pca_x';
		const yKey = projection === 'umap' ? 'umap_y' : 'pca_y';

		const result: OverlayItem[] = [];
		const seen = new Set<number>();

		// Pinned items — use stored card positions
		for (const pin of pins) {
			const p = points[pin.idx];
			if (!p) continue;
			seen.add(pin.idx);
			const pix = dataToPixel((p as any)[xKey] ?? 0, (p as any)[yKey] ?? 0);
			if (!pix) continue;
			result.push({
				point: p, idx: pin.idx,
				nodeX: pix.x, nodeY: pix.y,
				cardX: pin.x, cardY: pin.y,
				isPinned: true, isMe: pin.idx === meIdx && showMe, isHover: false,
				taper: taperPoly(pin.x, pin.y, pix.x, pix.y),
				color: getColor(p),
			});
		}

		// "Me" pin if not already pinned
		if (showMe && meIdx >= 0 && !seen.has(meIdx)) {
			const p = points[meIdx];
			const pix = dataToPixel((p as any)[xKey] ?? 0, (p as any)[yKey] ?? 0);
			if (pix) {
				// Find stored me-pin or default above node
				const mePin = pins.find(pin => pin.idx === meIdx);
				const cx = mePin?.x ?? pix.x;
				const cy = mePin?.y ?? pix.y - 40;
				seen.add(meIdx);
				result.push({
					point: p, idx: meIdx,
					nodeX: pix.x, nodeY: pix.y,
					cardX: cx, cardY: cy,
					isPinned: false, isMe: true, isHover: false,
					taper: taperPoly(cx, cy, pix.x, pix.y),
					color: getColor(p),
				});
			}
		}

		// Hover — auto-positioned above node
		if (hoveredIdx !== null && !seen.has(hoveredIdx)) {
			const p = points[hoveredIdx];
			if (p) {
				const pix = dataToPixel((p as any)[xKey] ?? 0, (p as any)[yKey] ?? 0);
				if (pix) {
					result.push({
						point: p, idx: hoveredIdx,
						nodeX: pix.x, nodeY: pix.y,
						cardX: pix.x, cardY: pix.y - 28,
						isPinned: false, isMe: false, isHover: true,
						taper: taperPoly(pix.x, pix.y - 28, pix.x, pix.y),
						color: getColor(p),
					});
				}
			}
		}

		return result;
	});

	function removePin(idx: number) {
		pins = pins.filter(p => p.idx !== idx);
	}

	function startDrag(e: MouseEvent, pointIdx: number, ov: OverlayItem) {
		e.preventDefault();
		e.stopPropagation();
		const plotRect = plotEl?.getBoundingClientRect();
		if (!plotRect) return;

		// Ensure point is in pins (e.g. "show me" overlay that isn't pinned yet)
		if (!pins.some(p => p.idx === pointIdx)) {
			pins = [...pins, { idx: pointIdx, x: ov.cardX, y: ov.cardY }];
		}

		const offX = ov.cardX - (e.clientX - plotRect.left);
		const offY = ov.cardY - (e.clientY - plotRect.top);

		function onMove(ev: MouseEvent) {
			const r = plotEl!.getBoundingClientRect();
			const pin = pins.find(p => p.idx === pointIdx);
			if (pin) {
				pin.x = ev.clientX - r.left + offX;
				pin.y = ev.clientY - r.top + offY;
				pins = [...pins];
			}
		}

		function onUp() {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	const COLOR_FIELDS = ['community', 'g_score', 'engagement', 'note_count', 'dominant_topic', 'alpha'];
	const CONNECT_FIELDS = ['none', 'nearest', 'follows', 'community', 'dominant_topic'];

	const TOPIC_COLORS: Record<string, string> = {
		bitcoin: '#f7931a', nostr: '#8b5cf6', tech: '#3b82f6', art: '#ec4899',
		privacy: '#10b981', politics: '#ef4444', music: '#f59e0b', food: '#84cc16',
		fitness: '#06b6d4', philosophy: '#a78bfa', other: '#6b7280',
	};

	const COMMUNITY_PALETTE = [
		'#4fc3f7', '#b4be82', '#e27878', '#a093c7', '#89b8c2',
		'#e2a478', '#84a0c6', '#c0ca33', '#ef5350', '#ab47bc',
		'#26a69a', '#ff7043', '#5c6bc0', '#66bb6a', '#ffa726',
		'#8d6e63', '#78909c', '#ec407a', '#29b6f6', '#9ccc65',
	];

	function getColor(p: ProjectionPoint): string {
		switch (colorBy) {
			case 'community': {
				const c = p.community ?? 0;
				return COMMUNITY_PALETTE[c % COMMUNITY_PALETTE.length];
			}
			case 'dominant_topic':
				return TOPIC_COLORS[p.dominant_topic] || TOPIC_COLORS.other;
			default:
				return 'var(--accent)';
		}
	}

	function getColorValue(p: ProjectionPoint): number {
		switch (colorBy) {
			case 'g_score': return p.g_score;
			case 'engagement': return Math.log1p(p.engagement);
			case 'note_count': return Math.log1p(p.note_count);
			case 'alpha': return p.alpha ?? 0;
			default: return 0;
		}
	}

	const useContinuousColor = $derived(
		['g_score', 'engagement', 'note_count', 'alpha'].includes(colorBy)
	);

	// Search matches (indices into points[])
	const matchIndices = $derived.by(() => {
		if (!search.trim()) return new Set<number>();
		const q = search.toLowerCase();
		const matches = new Set<number>();
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			if (
				p.name?.toLowerCase().includes(q) ||
				p.pk_full.includes(q) ||
				p.dominant_topic?.includes(q)
			) {
				matches.add(i);
			}
		}
		return matches;
	});

	const hasSearch = $derived(matchIndices.size > 0);

	async function loadData() {
		loading = true;
		error = '';
		try {
			const codename = $selectedCodename || undefined;
			const [metaResp, pointsResp] = await Promise.all([
				getProjectionMeta(codename),
				getProjectionPoints(codename, 'compact'),
			]);
			if (!metaResp.available) {
				error = 'No projection data available. Run project_embeddings.py first.';
				return;
			}
			meta = metaResp;
			points = pointsResp.points;
			if (meta.projections?.includes('umap')) {
				projection = 'umap';
			} else {
				projection = 'pca';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// Load neighbors from server (all connect modes use the same endpoint)
	async function loadNeighbors(mode: string, pubkeys: string[], k: number) {
		if (pubkeys.length < 1 || pubkeys.length > 500) {
			neighborMap = {};
			return;
		}
		edgesLoading = true;
		try {
			const codename = $selectedCodename || undefined;
			const resp = await getProjectionNeighbors(pubkeys, k, mode, codename);
			neighborMap = resp.neighbors;
		} catch {
			neighborMap = {};
		} finally {
			edgesLoading = false;
		}
	}

	const CONNECT_COLORS: Record<string, string> = {
		nearest: 'rgba(137, 184, 194, 0.5)',
		follows: 'rgba(160, 147, 199, 0.5)',
		community: 'rgba(79, 195, 247, 0.4)',
		dominant_topic: 'rgba(236, 72, 153, 0.4)',
	};

	const CONNECT_LABEL: Record<string, string> = {
		nearest: 'neighbor',
		follows: 'followed',
		community: 'community',
		dominant_topic: 'topic',
	};

	// Build edge traces from neighborMap (unified for all modes)
	function buildEdgeTraces(highlighted: ProjectionPoint[], xKey: string, yKey: string): any[] {
		if (connectBy === 'none' || Object.keys(neighborMap).length === 0) return [];

		const pkMap = new Map<string, ProjectionPoint>();
		for (const p of points) pkMap.set(p.pk_full, p);
		const highlightedPks = new Set(highlighted.map(p => p.pk_full));

		const xs: (number | null)[] = [];
		const ys: (number | null)[] = [];
		const neighborPks = new Set<string>();

		for (const anchor of highlighted) {
			const neighbors = neighborMap[anchor.pk_full] || [];
			const ax = (anchor as any)[xKey] ?? 0;
			const ay = (anchor as any)[yKey] ?? 0;
			for (const nb of neighbors) {
				const nbPoint = pkMap.get(nb.pubkey);
				if (!nbPoint) continue;
				xs.push(ax, (nbPoint as any)[xKey] ?? 0, null);
				ys.push(ay, (nbPoint as any)[yKey] ?? 0, null);
				neighborPks.add(nb.pubkey);
			}
		}

		const traces: any[] = [];
		const lineColor = CONNECT_COLORS[connectBy] || 'rgba(137, 184, 194, 0.4)';
		const label = CONNECT_LABEL[connectBy] || 'connected';

		if (xs.length > 0) {
			traces.push({
				x: xs, y: ys,
				mode: 'lines', type: 'scatter',
				line: { color: lineColor, width: 1 },
				hoverinfo: 'skip', showlegend: false,
			});
		}

		// Mark neighbor points not in highlight set
		const extraNeighbors = points.filter(p => neighborPks.has(p.pk_full) && !highlightedPks.has(p.pk_full));
		if (extraNeighbors.length > 0) {
			traces.push({
				x: extraNeighbors.map(p => (p as any)[xKey] ?? 0),
				y: extraNeighbors.map(p => (p as any)[yKey] ?? 0),
				text: extraNeighbors.map(p => p.name || truncatePk(p.pk_full)),
				mode: 'markers', type: 'scattergl',
				marker: { size: 5, opacity: 0.5, color: lineColor.replace(/[\d.]+\)$/, '0.8)'), symbol: 'diamond' },
				hoverinfo: 'text',
				hovertemplate: `%{text}<extra>${label}</extra>`,
				showlegend: false,
			});
		}

		return traces;
	}

	function renderPlot() {
		if (!Plotly || !plotDiv || points.length === 0) return;
		plotEl = plotDiv; // keep non-reactive ref in sync

		const xKey = projection === 'umap' ? 'umap_x' : 'pca_x';
		const yKey = projection === 'umap' ? 'umap_y' : 'pca_y';

		const traces: any[] = [];

		if (hasSearch) {
			// Background: all points, dimmed
			const bgXs = points.map(p => (p as any)[xKey] ?? 0);
			const bgYs = points.map(p => (p as any)[yKey] ?? 0);
			const bgSize = points.length > 50000 ? 2 : points.length > 10000 ? 3 : 4;
			traces.push({
				x: bgXs, y: bgYs,
				mode: 'markers', type: 'scattergl',
				marker: { size: bgSize, opacity: 0.12, color: cssVar('--plot-dim') },
				hoverinfo: 'skip', showlegend: false,
			});

			// Highlighted: matched points, bright + larger
			const matched = Array.from(matchIndices).map(i => points[i]);
			const hlXs = matched.map(p => (p as any)[xKey] ?? 0);
			const hlYs = matched.map(p => (p as any)[yKey] ?? 0);
			const hlTexts = matched.map(p => p.name || truncatePk(p.pk_full));
			const hlCustom = Array.from(matchIndices);
			const hlSize = Math.max(6, Math.min(12, 100 / Math.sqrt(matched.length)));

			const hlTrace: any = {
				x: hlXs, y: hlYs,
				text: hlTexts, customdata: hlCustom,
				mode: 'markers', type: 'scattergl',
				marker: { size: hlSize, opacity: 0.95 },
				hoverinfo: 'text',
				hovertemplate: '%{text}<extra></extra>',
				showlegend: false,
			};

			if (useContinuousColor) {
				hlTrace.marker.color = matched.map(p => getColorValue(p));
				hlTrace.marker.colorscale = 'Viridis';
				hlTrace.marker.colorbar = {
					title: colorBy,
					tickfont: { color: cssVar('--plot-tick'), size: 10 },
					titlefont: { color: cssVar('--plot-font'), size: 11 },
				};
			} else {
				hlTrace.marker.color = matched.map(p => getColor(p));
			}

			traces.push(hlTrace);

			// Connection edges between matched points
			const edgeTraces = buildEdgeTraces(matched, xKey, yKey);
			traces.push(...edgeTraces);
		} else {
			// No search: show all points normally
			const xs = points.map(p => (p as any)[xKey] ?? 0);
			const ys = points.map(p => (p as any)[yKey] ?? 0);
			const texts = points.map(p => p.name || truncatePk(p.pk_full));
			const customdata = points.map((_, i) => i);

			const trace: any = {
				x: xs, y: ys, text: texts, customdata,
				mode: 'markers', type: 'scattergl',
				marker: {
					size: points.length > 50000 ? 2 : points.length > 10000 ? 3 : 5,
					opacity: 0.7,
				},
				hoverinfo: 'text',
				hovertemplate: '%{text}<extra></extra>',
				showlegend: false,
			};

			if (useContinuousColor) {
				trace.marker.color = points.map(p => getColorValue(p));
				trace.marker.colorscale = 'Viridis';
				trace.marker.colorbar = {
					title: colorBy,
					tickfont: { color: cssVar('--plot-tick'), size: 10 },
					titlefont: { color: cssVar('--plot-font'), size: 11 },
				};
			} else {
				trace.marker.color = points.map(p => getColor(p));
			}

			traces.push(trace);

			// If pinned points exist and a connect mode is active, draw edges from them
			if (connectBy !== 'none' && pins.length > 0) {
				const pinnedPoints = pins.map(p => points[p.idx]).filter(Boolean);
				if (pinnedPoints.length > 0) {
					const edgeTraces = buildEdgeTraces(pinnedPoints, xKey, yKey);
					traces.push(...edgeTraces);
				}
			}
		}

		const layout: any = {
			paper_bgcolor: cssVar('--plot-paper'),
			plot_bgcolor: cssVar('--plot-bg'),
			font: { family: 'JetBrains Mono, monospace', color: cssVar('--plot-font'), size: 10 },
			margin: { l: 40, r: 20, t: 30, b: 40 },
			xaxis: { gridcolor: cssVar('--plot-grid'), zerolinecolor: cssVar('--plot-zeroline'), title: '' },
			yaxis: { gridcolor: cssVar('--plot-grid'), zerolinecolor: cssVar('--plot-zeroline'), title: '' },
			hovermode: 'closest',
			dragmode: 'pan',
		};

		const config = {
			responsive: true,
			scrollZoom: true,
			displayModeBar: false,
		};

		Plotly.react(plotDiv, traces, layout, config);

		// Capture initial axis range for zoom-based marker scaling
		const fl = (plotDiv as any)._fullLayout;
		if (fl?.xaxis?.range && fl?.yaxis?.range) {
			const xr = fl.xaxis.range;
			const yr = fl.yaxis.range;
			initialRange = {
				xSpan: Math.abs(xr[1] - xr[0]) || 1,
				ySpan: Math.abs(yr[1] - yr[0]) || 1,
			};
		}

		const pd = plotDiv as any;
		pd.removeAllListeners?.('plotly_click');
		pd.removeAllListeners?.('plotly_hover');
		pd.removeAllListeners?.('plotly_unhover');
		pd.removeAllListeners?.('plotly_relayout');

		pd.on('plotly_click', (data: any) => {
			if (data.points?.[0]) {
				const idx = data.points[0].customdata;
				if (typeof idx === 'number') {
					const existing = pins.findIndex(p => p.idx === idx);
					if (existing >= 0) {
						pins = pins.filter(p => p.idx !== idx);
					} else {
						// Place card above the clicked node
						const p = points[idx];
						const xKey = projection === 'umap' ? 'umap_x' : 'pca_x';
						const yKey = projection === 'umap' ? 'umap_y' : 'pca_y';
						const pix = dataToPixel((p as any)[xKey] ?? 0, (p as any)[yKey] ?? 0);
						if (pix) {
							pins = [...pins, { idx, x: pix.x, y: pix.y - 40 }];
						}
					}
				}
			}
		});

		pd.on('plotly_hover', (data: any) => {
			const cd = data.points?.[0]?.customdata;
			if (typeof cd === 'number' && cd !== hoveredIdx) {
				// Don't show hover preview for already-pinned nodes
				if (pins.some(p => p.idx === cd)) hoveredIdx = null;
				else hoveredIdx = cd;
			}
		});

		pd.on('plotly_unhover', () => {
			hoveredIdx = null;
		});

		let restyling = false;
		pd.on('plotly_relayout', () => {
			if (restyling) return;
			cancelAnimationFrame(relayoutRaf);
			relayoutRaf = requestAnimationFrame(() => {
				layoutVersion++;
				// Scale markers with zoom level
				const curLayout = (plotDiv as any)?._fullLayout;
				if (curLayout?.xaxis?.range && curLayout?.yaxis?.range) {
					const xSpan = Math.abs(curLayout.xaxis.range[1] - curLayout.xaxis.range[0]);
					const ySpan = Math.abs(curLayout.yaxis.range[1] - curLayout.yaxis.range[0]);
					const zoomX = initialRange.xSpan / (xSpan || 1);
					const zoomY = initialRange.ySpan / (ySpan || 1);
					const zoom = Math.sqrt(zoomX * zoomY);
					const newSize = Math.min(BASE_SIZE * Math.sqrt(zoom), 20);
					const traceIndices = (plotDiv as any).data
						.map((_: any, i: number) => i)
						.filter((i: number) => (plotDiv as any).data[i].type === 'scattergl');
					if (traceIndices.length > 0) {
						restyling = true;
						Plotly.restyle(plotDiv, { 'marker.size': newSize }, traceIndices)
							.then(() => { restyling = false; });
					}
				}
			});
		});
	}

	// Compute active anchor pubkeys (search matches or pinned points)
	const anchorPks = $derived.by(() => {
		if (matchIndices.size > 0) {
			return Array.from(matchIndices).map(i => points[i].pk_full);
		}
		if (pins.length > 0 && (connectBy === 'nearest' || connectBy === 'follows')) {
			return pins.map(p => points[p.idx]?.pk_full).filter(Boolean) as string[];
		}
		return [] as string[];
	});

	// Load neighbors from server when connect mode, anchors, or K change
	$effect(() => {
		if (connectBy !== 'none' && anchorPks.length > 0 && anchorPks.length <= 500) {
			loadNeighbors(connectBy, anchorPks, nearestK);
		} else {
			neighborMap = {};
		}
	});

	// Reactive render — triggers when any dependency changes
	$effect(() => {
		if (plotlyReady && plotDiv && points.length > 0) {
			// Access reactive deps to subscribe
			void projection;
			void colorBy;
			void connectBy;
			void nearestK;
			void matchIndices;
			void neighborMap;
			void $theme;
			renderPlot();
		}
	});

	onMount(async () => {
		// Load Plotly from CDN
		const script = document.createElement('script');
		script.src = 'https://cdn.plot.ly/plotly-2.35.2.min.js';
		script.onload = () => {
			Plotly = (window as any).Plotly;
			plotlyReady = true;
		};
		document.head.appendChild(script);

		await loadData();
	});
</script>

<svelte:head>
	<title>TRUSTr / Scatter</title>
</svelte:head>

<div class="scatter-layout">
	<!-- Controls sidebar -->
	<div class="sidebar">
		<div class="ctrl-group">
			<label>Projection</label>
			<div class="btn-group">
				{#each ['pca', 'umap'] as proj}
					<button
						class="ctrl-btn"
						class:active={projection === proj}
						disabled={!meta?.projections?.includes(proj)}
						onclick={() => projection = proj as 'pca' | 'umap'}
					>{proj.toUpperCase()}</button>
				{/each}
			</div>
		</div>

		<div class="ctrl-group">
			<label>Color by</label>
			<div class="btn-group vertical">
				{#each COLOR_FIELDS as field}
					<button
						class="ctrl-btn"
						class:active={colorBy === field}
						onclick={() => colorBy = field}
					>{field}</button>
				{/each}
			</div>
		</div>

		<div class="ctrl-group">
			<label>Connect by</label>
			<div class="btn-group vertical">
				{#each CONNECT_FIELDS as field}
					<button
						class="ctrl-btn"
						class:active={connectBy === field}
						onclick={() => connectBy = field}
					>{field}</button>
				{/each}
			</div>
			{#if connectBy !== 'none'}
				<div class="k-slider">
					<label>K = {nearestK}</label>
					<input type="range" min={1} max={20} step={1} bind:value={nearestK} />
				</div>
			{/if}
			{#if edgesLoading}
				<div class="connect-status">loading...</div>
			{:else if connectBy !== 'none' && Object.keys(neighborMap).length > 0}
				<div class="connect-status">{Object.values(neighborMap).reduce((s, n) => s + n.length, 0)} connections</div>
			{/if}
		</div>

		<div class="ctrl-group">
			<label>Search</label>
			<input
				type="text"
				placeholder="name, pubkey, topic..."
				bind:value={search}
			/>
			{#if hasSearch}
				<div class="search-count">{fmtNum(matchIndices.size)} match{matchIndices.size === 1 ? '' : 'es'}</div>
			{/if}
		</div>

		{#if meta}
			<div class="meta-info">
				<div>{fmtNum(meta.n_users)} users</div>
				<div>run: {meta.timestamp}</div>
				<div>label: {meta.label}</div>
			</div>
		{/if}

		<!-- Pinned list -->
		{#if pins.length > 0 || (showMe && meIdx >= 0)}
			<div class="pin-list">
				<div class="pin-list-header">
					<label>Pinned</label>
					{#if pins.length > 0}
						<button class="pin-clear" onclick={() => pins = []}>clear</button>
					{/if}
				</div>
				{#if showMe && meIdx >= 0 && !pins.some(p => p.idx === meIdx)}
					{@const p = points[meIdx]}
					<div class="pin-entry is-me">
						{#if p.picture}
							<img class="pin-avatar" src={p.picture} alt=""
								onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
						{/if}
						<span class="pin-name">{p.name || truncatePk(p.pk_full)}</span>
						<span class="pin-detail">G:{p.g_score.toFixed(2)}</span>
						<button class="pin-x" onclick={() => showMe = false}>×</button>
					</div>
				{/if}
				{#each pins as pin (pin.idx)}
					{@const p = points[pin.idx]}
					{#if p}
						<div class="pin-entry">
							{#if p.picture}
								<img class="pin-avatar" src={p.picture} alt=""
									onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
							{/if}
							<span class="pin-name">{p.name || truncatePk(p.pk_full)}</span>
							<span class="pin-detail">G:{p.g_score.toFixed(2)}</span>
							<button class="pin-x" onclick={() => removePin(pin.idx)}>×</button>
						</div>
					{/if}
				{/each}
			</div>
		{/if}

		{#if $isSignedIn}
			<div class="ctrl-group">
				<button
					class="ctrl-btn"
					class:active={showMe && meIdx >= 0}
					disabled={meIdx < 0}
					onclick={() => showMe = !showMe}
					title={meIdx < 0 ? 'Your pubkey is not in the projection' : 'Pin your node preview'}
				>show me</button>
			</div>
		{/if}
	</div>

	<!-- Plot area -->
	<div class="plot-area">
		{#if loading}
			<div class="plot-msg">Loading projection data...</div>
		{:else if error}
			<div class="plot-msg error">{error}</div>
		{:else}
			<div bind:this={plotDiv} class="plotly-container"></div>
			{#if overlays.length > 0}
				<svg class="preview-svg">
					{#each overlays as ov (ov.idx)}
						{#if ov.taper}
							<polygon
								points={ov.taper}
								fill={ov.color}
								opacity={ov.isHover ? 0.3 : 0.5}
							/>
						{/if}
					{/each}
				</svg>
				{#each overlays as ov (ov.idx)}
					<div
						class="node-preview"
						class:is-hover={ov.isHover}
						class:is-pinned={ov.isPinned}
						class:is-me={ov.isMe}
						style="left: {ov.cardX}px; top: {ov.cardY}px; border-color: {ov.color}; --np-color: {ov.color}"
						onmousedown={(e) => {
							if (ov.isPinned || ov.isMe) startDrag(e, ov.idx, ov);
						}}
					>
						<div class="np-row">
							{#if ov.point.picture}
								<img
									class="np-avatar"
									src={ov.point.picture}
									alt=""
									onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
								/>
							{/if}
							<div class="np-info">
								<div class="np-name">{ov.point.name || truncatePk(ov.point.pk_full)}</div>
								<div class="np-stats">
									G:{ov.point.g_score.toFixed(2)}
									{#if ov.point.dominant_topic}· {ov.point.dominant_topic}{/if}
								</div>
							</div>
						</div>
						{#if ov.isPinned || ov.isMe}
							<button class="np-close" onclick={(e) => {
								e.stopPropagation();
								if (ov.isMe && !ov.isPinned) showMe = false;
								else removePin(ov.idx);
							}}>×</button>
						{/if}
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>

<style>
	.scatter-layout {
		display: flex;
		gap: 16px;
		height: calc(100vh - 90px);
	}

	.sidebar {
		width: 200px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		overflow-y: auto;
	}

	.ctrl-group label {
		display: block;
		font-size: 10px;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.8px;
		margin-bottom: 6px;
	}

	.btn-group {
		display: flex;
		gap: 4px;
	}
	.btn-group.vertical {
		flex-direction: column;
	}

	.ctrl-btn {
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 11px;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		transition: all 0.15s;
		text-align: left;
	}
	.ctrl-btn:hover:not(:disabled) {
		border-color: var(--border-light);
	}
	.ctrl-btn.active {
		background: var(--accent-glow);
		color: var(--accent);
		border-color: var(--accent-dim);
	}
	.ctrl-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.ctrl-group input[type="text"] {
		width: 100%;
		background: var(--bg-elevated);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px 8px;
		font-family: inherit;
		font-size: 11px;
		outline: none;
	}
	.ctrl-group input[type="text"]:focus {
		border-color: var(--accent-dim);
	}
	.ctrl-group input[type="text"]::placeholder {
		color: var(--text-muted);
	}

	.meta-info {
		font-size: 10px;
		color: var(--text-muted);
		line-height: 1.6;
		padding: 8px 10px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.search-count {
		margin-top: 4px;
		font-size: 10px;
		color: var(--pool-color);
		font-weight: 500;
	}
	.k-slider {
		margin-top: 6px;
	}
	.k-slider label {
		font-size: 10px;
		color: var(--text-secondary);
	}
	.k-slider input[type="range"] {
		width: 100%;
		-webkit-appearance: none;
		appearance: none;
		height: 3px;
		background: var(--border);
		border-radius: 2px;
		outline: none;
		margin-top: 4px;
	}
	.k-slider input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
	}
	.k-slider input[type="range"]::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--accent);
	}
	.connect-status {
		margin-top: 4px;
		font-size: 9px;
		color: var(--text-muted);
	}

	.pin-list {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 8px;
		font-size: 10px;
	}
	.pin-list-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}
	.pin-list-header label {
		margin-bottom: 0;
	}
	.pin-clear {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 9px;
		cursor: pointer;
		padding: 0 2px;
	}
	.pin-clear:hover { color: var(--text-secondary); }
	.pin-avatar {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--bg-card);
	}
	.pin-entry {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
		border-top: 1px solid var(--border);
	}
	.pin-entry.is-me { border-color: var(--accent-dim); }
	.pin-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-primary);
		font-weight: 500;
	}
	.pin-detail {
		color: var(--text-muted);
		white-space: nowrap;
	}
	.pin-x {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
		padding: 0 2px;
		line-height: 1;
		flex-shrink: 0;
	}
	.pin-x:hover { color: var(--text-primary); }

	.plot-area {
		flex: 1;
		min-width: 0;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		position: relative;
	}

	.plotly-container {
		width: 100%;
		height: 100%;
	}
	.plotly-container :global(.hoverlayer) {
		display: none;
	}

	.preview-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 5;
	}

	.node-preview {
		position: absolute;
		transform: translate(-50%, -100%);
		background: var(--bg-surface);
		border: 2px solid var(--border);
		border-radius: 6px;
		padding: 6px 10px;
		pointer-events: auto;
		z-index: 6;
		white-space: nowrap;
		max-width: 200px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
	}
	.node-preview.is-hover {
		opacity: 0.9;
		pointer-events: none;
	}
	.node-preview.is-pinned,
	.node-preview.is-me {
		cursor: grab;
	}
	.np-row {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.np-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		background: var(--bg-card);
	}
	.np-info {
		min-width: 0;
	}
	.np-name {
		font-size: 11px;
		font-weight: 500;
		color: var(--np-color, var(--text-primary));
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.np-stats {
		font-size: 9px;
		color: var(--text-secondary);
		margin-top: 1px;
	}
	.np-close {
		position: absolute;
		top: 2px;
		right: 4px;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 11px;
		cursor: pointer;
		line-height: 1;
		padding: 0 2px;
	}
	.np-close:hover {
		color: var(--accent);
	}

	.plot-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-muted);
		font-size: 13px;
	}
	.plot-msg.error {
		color: var(--tier-x);
	}

	@media (max-width: 800px) {
		.scatter-layout {
			flex-direction: column;
			height: auto;
		}
		.sidebar {
			width: 100%;
			flex-direction: row;
			flex-wrap: wrap;
		}
		.plot-area {
			height: 500px;
		}
	}
</style>
