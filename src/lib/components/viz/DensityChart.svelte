<script lang="ts">
	import { fmtDateShort, fmtNum } from '$lib/utils/format';

	let {
		dayStart,
		daySeconds,
		dailyCounts,
		poolStart,
		poolEnd,
		minTs: shelfMin,
		maxTs: shelfMax,
		onpan,
		onwidthchange
	}: {
		dayStart: number;
		daySeconds: number;
		dailyCounts: number[];
		poolStart: number;
		poolEnd: number;
		minTs: number;
		maxTs: number;
		onpan: (newCenter: number) => void;
		onwidthchange: (newWidth: number) => void;
	} = $props();

	const WIDTH = 700;
	const HEIGHT = 80;
	const PAD_X = 0;
	const PAD_Y = 4;
	const chartW = WIDTH - PAD_X * 2;
	const chartH = HEIGHT - PAD_Y * 2;

	const MIN_WIDTH_SECONDS = 1 * 86400;  // 1 day minimum

	const maxCount = $derived(Math.max(1, ...dailyCounts));
	const numDays = $derived(dailyCounts.length);
	const barW = $derived(numDays > 0 ? chartW / numDays : 1);
	const chartMinTs = $derived(dayStart);
	const chartMaxTs = $derived(dayStart + numDays * daySeconds);
	const tsRange = $derived(chartMaxTs - chartMinTs || 1);

	function tsToX(ts: number): number {
		return PAD_X + ((ts - chartMinTs) / tsRange) * chartW;
	}

	// Selection overlay bounds
	const selX1 = $derived(Math.max(PAD_X, tsToX(poolStart)));
	const selX2 = $derived(Math.min(PAD_X + chartW, tsToX(poolEnd)));
	const selW = $derived(Math.max(0, selX2 - selX1));

	// Current width in seconds for display
	const currentWidth = $derived(poolEnd - poolStart);
	const widthLabel = $derived.by(() => {
		const days = currentWidth / 86400;
		if (days >= 365) return `${(days / 365).toFixed(1)}y`;
		if (days >= 30) return `${(days / 30).toFixed(1)}mo`;
		return `${Math.round(days)}d`;
	});

	// Axis labels
	const axisLabels = $derived.by(() => {
		if (numDays === 0) return [];
		const labels: { x: number; text: string }[] = [];
		const step = numDays > 180 ? 60 : numDays > 90 ? 30 : numDays > 30 ? 14 : 7;
		for (let i = 0; i < numDays; i += step) {
			const ts = dayStart + i * daySeconds;
			labels.push({ x: tsToX(ts), text: fmtDateShort(ts) });
		}
		labels.push({ x: tsToX(chartMaxTs), text: fmtDateShort(chartMaxTs) });
		return labels;
	});

	// Drag state
	let dragging = $state(false);
	let dragStartX = $state(0);
	let dragStartCenter = $state(0);
	let svgEl: SVGSVGElement;

	// Tooltip
	let hoverIdx = $state(-1);
	let hoverX = $state(0);
	let hoverY = $state(0);
	const hoverDay = $derived(hoverIdx >= 0 ? dayStart + hoverIdx * daySeconds : 0);
	const hoverCount = $derived(hoverIdx >= 0 ? dailyCounts[hoverIdx] : 0);

	function getMouseX(e: MouseEvent): number {
		const rect = svgEl.getBoundingClientRect();
		return ((e.clientX - rect.left) / rect.width) * WIDTH;
	}

	function handleMouseDown(e: MouseEvent) {
		dragging = true;
		dragStartX = getMouseX(e);
		dragStartCenter = (poolStart + poolEnd) / 2;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!svgEl) return;
		const mx = getMouseX(e);

		const idx = Math.floor((mx - PAD_X) / barW);
		if (idx >= 0 && idx < numDays) {
			hoverIdx = idx;
			const rect = svgEl.getBoundingClientRect();
			hoverX = e.clientX - rect.left;
			hoverY = e.clientY - rect.top;
		} else {
			hoverIdx = -1;
		}

		if (dragging) {
			const dx = mx - dragStartX;
			const dtSeconds = (dx / chartW) * tsRange;
			const newCenter = dragStartCenter + dtSeconds;
			onpan(newCenter);
		}
	}

	function handleMouseUp() {
		dragging = false;
	}

	function handleMouseLeave() {
		hoverIdx = -1;
		dragging = false;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const maxWidth = shelfMax - shelfMin;
		// Scroll up = narrow, scroll down = widen
		const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
		const newWidth = Math.max(MIN_WIDTH_SECONDS, Math.min(maxWidth, currentWidth * factor));
		onwidthchange(newWidth);
	}
</script>

<div class="density-chart-wrap">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		bind:this={svgEl}
		viewBox="0 0 {WIDTH} {HEIGHT + 20}"
		class="density-svg"
		class:dragging
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseLeave}
		onwheel={handleWheel}
		role="img"
		aria-label="Event density chart"
	>
		<!-- Bars -->
		{#each dailyCounts as count, i}
			{@const barH = (count / maxCount) * chartH}
			{@const bx = PAD_X + i * barW}
			{@const barTs = dayStart + i * daySeconds}
			{@const inRange = barTs >= poolStart && barTs < poolEnd}
			<rect
				x={bx}
				y={PAD_Y + chartH - barH}
				width={Math.max(0.5, barW - 0.5)}
				height={Math.max(1, barH)}
				fill={inRange ? 'var(--pool-color)' : 'var(--border-light)'}
				opacity={inRange ? 0.7 : 0.4}
				rx="0.5"
			/>
		{/each}

		<!-- Selection overlay -->
		{#if selW > 0}
			<rect
				x={selX1}
				y={0}
				width={selW}
				height={HEIGHT}
				fill="rgba(137, 184, 194, 0.08)"
				stroke="var(--pool-color)"
				stroke-width="1.5"
				stroke-dasharray="4 2"
				rx="2"
			/>
			<!-- Width label centered on selection -->
			<text
				x={selX1 + selW / 2}
				y={HEIGHT / 2 + 4}
				text-anchor="middle"
				fill="var(--pool-color)"
				font-size="10"
				font-family="inherit"
				opacity="0.8"
			>{widthLabel}</text>
		{/if}

		<!-- Axis labels -->
		{#each axisLabels as lbl}
			<text
				x={lbl.x}
				y={HEIGHT + 14}
				text-anchor="middle"
				fill="var(--text-muted)"
				font-size="9"
				font-family="inherit"
			>{lbl.text}</text>
		{/each}
	</svg>

	<div class="scroll-hint">scroll to resize window</div>

	<!-- Tooltip -->
	{#if hoverIdx >= 0}
		<div
			class="density-tooltip"
			style="left: {hoverX}px; top: {hoverY - 36}px;"
		>
			{fmtDateShort(hoverDay)} — {fmtNum(hoverCount)} events
		</div>
	{/if}
</div>

<style>
	.density-chart-wrap {
		position: relative;
		user-select: none;
	}
	.density-svg {
		width: 100%;
		height: auto;
		cursor: grab;
		display: block;
	}
	.density-svg.dragging {
		cursor: grabbing;
	}
	.scroll-hint {
		text-align: center;
		font-size: 9px;
		color: var(--text-muted);
		margin-top: 2px;
		opacity: 0.5;
	}
	.density-tooltip {
		position: absolute;
		background: var(--bg-surface);
		border: 1px solid var(--border-light);
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 10px;
		color: var(--text-primary);
		white-space: nowrap;
		pointer-events: none;
		transform: translateX(-50%);
		z-index: 10;
	}
</style>
