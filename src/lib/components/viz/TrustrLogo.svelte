<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { theme } from "$lib/stores/theme";

    // --- Props ---
    let {
        width = 130,
        height = 130,
        spinning = true,
        compact = false,
    }: {
        width?: number;
        height?: number;
        spinning?: boolean;
        compact?: boolean;
    } = $props();

    let canvas: HTMLCanvasElement;
    let ecgCanvas: HTMLCanvasElement;
    let raf: number;
    let collapseTimer: ReturnType<typeof setTimeout>;
    let collapseInterval: ReturnType<typeof setInterval>;

    // JS-driven sequential collapse: this counter ticks up one at a time
    let collapsedCount = $state(0);
    let collapseStarted = $state(false);
    let flashActive = $state(false);
    let showTagline = $state(false);
    let spikeTimers: ReturnType<typeof setTimeout>[] = [];
    let themeUnsub: (() => void) | undefined;

    // --- ECG animation parameters ---
    const ECG_W = 240;
    const ECG_H = 48;
    const ECG_BREATH_MS = 950;
    const ECG_TOTAL_BLIPS = 2; // micro sweeps before final bright sweep
    let ecgStartTime = 0;

    const SUBTITLE_TEXT = "Nostr Discovery Engine";
    const COLLAPSE_TICK_MS = 45; // ms between each letter disappearing

    // Build per-letter array: left-to-right sequential removal.
    // Flex centering on the wrapper pulls NDE to center as letters disappear.
    const subtitleLetters = (() => {
        const result: {
            char: string;
            initial: boolean;
            space: boolean;
            removeIdx: number;
        }[] = [];
        let wordStart = true;
        let removeIdx = 0;
        for (const ch of SUBTITLE_TEXT) {
            if (ch === " ") {
                result.push({
                    char: " ",
                    initial: false,
                    space: true,
                    removeIdx,
                });
                removeIdx++;
                wordStart = true;
            } else {
                const isInitial = wordStart;
                result.push({
                    char: ch,
                    initial: isInitial,
                    space: false,
                    removeIdx: isInitial ? -1 : removeIdx,
                });
                if (!isInitial) removeIdx++;
                wordStart = false;
            }
        }
        return result;
    })();
    const totalToRemove = subtitleLetters.filter(
        (l) => l.removeIdx >= 0,
    ).length;

    // ============================================================
    //  TUNABLE PARAMETERS
    // ============================================================
    const P = {
        spinSpeed: 0.0006,
        wobbleSpeed: 0.0003,
        wobbleAmp: 0.2,

        nodeCount: 70,
        spreadLength: 0.7,
        spreadMiddle: 0.55,
        spreadEnds: 0.06,
        squeezePower: 2.0,

        nearestK: 5,
        randomEdges: 3,

        sparkLambda: 0.6,
        propagationSpeed: 16,
        sparkFadeSpeed: 0.5,

        cubeSize: 1.6,
        cubeOpacity: 0.55,
        cubeLineWidth: 1.5,
        fov: 5.0,
        projScale: 70,

        nodeRadius: 2.5,
        edgeOpacity: 0.12,
    };

    // --- 3D math ---
    function rotX(p: number[], a: number): number[] {
        const c = Math.cos(a),
            s = Math.sin(a);
        return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
    }
    function rotY(p: number[], a: number): number[] {
        const c = Math.cos(a),
            s = Math.sin(a);
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
    }
    function project(
        p: number[],
        fov: number,
        cx: number,
        cy: number,
        projScale: number,
    ): number[] {
        const scale = fov / (fov + p[2]);
        return [
            cx + p[0] * scale * projScale,
            cy + p[1] * scale * projScale,
            scale,
        ];
    }

    function lensSpread(xNorm: number, power: number): number {
        return Math.pow(1 - Math.pow(Math.abs(xNorm), power), 1 / power);
    }

    function dist3(a: number[], b: number[]): number {
        return Math.sqrt(
            (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
        );
    }

    // --- BFS shortest path ---
    function bfs(adj: number[][], start: number, end: number): number[] | null {
        const visited = new Set([start]);
        const queue: number[][] = [[start]];
        while (queue.length) {
            const path = queue.shift()!;
            const curr = path[path.length - 1];
            if (curr === end) return path;
            for (const nb of adj[curr]) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    queue.push([...path, nb]);
                }
            }
        }
        return null;
    }

    // --- Color interpolation ---
    function hexToRgb(hex: string): [number, number, number] {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function lerpColor(a: string, b: string, t: number): string {
        const [ar, ag, ab] = hexToRgb(a);
        const [br, bg, bb] = hexToRgb(b);
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return `rgb(${r},${g},${bl})`;
    }

    onMount(() => {
        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const cx = width / 2,
            cy = height / 2;
        const hs = P.cubeSize / 2;

        // Scale projection to canvas size   projScale 70 is tuned for ~480px width
        const projScale = compact
            ? Math.min(width, height) * 0.28
            : P.projScale;
        const nodeCount = compact ? 20 : P.nodeCount;
        const nodeRadius = compact ? 1.2 : P.nodeRadius;
        const cubeLineWidth = compact ? 0.8 : P.cubeLineWidth;

        // --- Theme-reactive colors ---
        let accentColor = "#84a0c6";
        let sparkColor = "#8ec8ff";
        let nodeColor = "#282a36";
        let edgeColor = "#3d4455";
        let cubeColor = "#84a0c6";
        let cubeAlpha = P.cubeOpacity;
        let edgeBaseAlpha = P.edgeOpacity;
        // ECG colors (parameterized for light mode)
        let ecgBright = "rgba(255,255,255,0.7)";
        let ecgDim = "rgba(255,255,255,0.2)";
        let ecgDimAhead = "rgba(255,255,255,0.1)";
        let ecgDot = "rgba(255,255,255,0.95)";
        let ecgDotDim = "rgba(255,255,255,0.35)";
        let ecgGlowIn = "rgba(255,255,255,0.3)";
        let ecgGlowOut = "rgba(255,255,255,0)";

        function applyTheme(dark: boolean) {
            if (dark) {
                accentColor = "#84a0c6";
                sparkColor = "#8ec8ff";
                nodeColor = "#282a36";
                edgeColor = "#3d4455";
                cubeColor = "#84a0c6";
                cubeAlpha = P.cubeOpacity;
                edgeBaseAlpha = P.edgeOpacity;
                ecgBright = "rgba(255,255,255,0.7)";
                ecgDim = "rgba(255,255,255,0.2)";
                ecgDimAhead = "rgba(255,255,255,0.1)";
                ecgDot = "rgba(255,255,255,0.95)";
                ecgDotDim = "rgba(255,255,255,0.35)";
                ecgGlowIn = "rgba(255,255,255,0.3)";
                ecgGlowOut = "rgba(255,255,255,0)";
            } else {
                accentColor = "#1e3a6a";
                sparkColor = "#94a8c8";
                nodeColor = "#1e3a6a";
                edgeColor = "#1e3a6a";
                cubeColor = "#4271ae";
                cubeAlpha = 0.45;
                edgeBaseAlpha = 0.28;
                ecgBright = "rgba(30,58,106,0.55)";
                ecgDim = "rgba(30,58,106,0.12)";
                ecgDimAhead = "rgba(30,58,106,0.08)";
                ecgDot = "rgba(30,58,106,0.75)";
                ecgDotDim = "rgba(30,58,106,0.25)";
                ecgGlowIn = "rgba(30,58,106,0.2)";
                ecgGlowOut = "rgba(30,58,106,0)";
            }
        }

        themeUnsub = theme.subscribe((t) => applyTheme(t !== "light"));

        // --- Generate lens-shaped node positions ---
        const positions: number[][] = [];
        for (let i = 0; i < nodeCount; i++) {
            const xN = (Math.random() - 0.5) * 2;
            const x = xN * P.spreadLength * hs;
            const factor = lensSpread(xN, P.squeezePower);
            const spread =
                (P.spreadEnds + factor * (P.spreadMiddle - P.spreadEnds)) * hs;
            const y = (Math.random() - 0.5) * 2 * spread;
            const z = (Math.random() - 0.5) * 2 * spread;
            positions.push([x, y, z]);
        }

        // --- Build adjacency ---
        const adj: number[][] = positions.map(() => []);
        const edgeSet = new Set<string>();
        const addEdge = (i: number, j: number) => {
            if (i === j) return;
            const key = Math.min(i, j) + "-" + Math.max(i, j);
            if (edgeSet.has(key)) return;
            edgeSet.add(key);
            adj[i].push(j);
            adj[j].push(i);
        };
        for (let i = 0; i < nodeCount; i++) {
            const dists = positions
                .map((p, j) => ({ j, d: dist3(positions[i], p) }))
                .filter((x) => x.j !== i)
                .sort((a, b) => a.d - b.d);
            for (let k = 0; k < P.nearestK && k < dists.length; k++)
                addEdge(i, dists[k].j);
            for (let r = 0; r < P.randomEdges; r++)
                addEdge(i, Math.floor(Math.random() * nodeCount));
        }

        const edges = [...edgeSet].map((k) => k.split("-").map(Number));

        // Edge key   index lookup
        const edgeKeyToIdx: Record<string, number> = {};
        edges.forEach(([a, b], i) => {
            edgeKeyToIdx[Math.min(a, b) + "-" + Math.max(a, b)] = i;
        });

        // --- Cube vertices ---
        const cubeVerts = [
            [-hs, -hs, -hs],
            [-hs, -hs, hs],
            [-hs, hs, -hs],
            [-hs, hs, hs],
            [hs, -hs, -hs],
            [hs, -hs, hs],
            [hs, hs, -hs],
            [hs, hs, hs],
        ];
        const cubeEdgeIdx = [
            [0, 1],
            [0, 2],
            [0, 4],
            [1, 3],
            [1, 5],
            [2, 3],
            [2, 6],
            [3, 7],
            [4, 5],
            [4, 6],
            [5, 7],
            [6, 7],
        ];

        // --- Spark state ---
        interface Spark {
            path: number[];
            edgeKeys: string[];
            wavefront: number;
            done: boolean;
            fadeLife: number;
            speed: number;
        }
        let sparks: Spark[] = [];
        const nodeGlow = new Float32Array(nodeCount);
        const edgeGlow = new Float32Array(edges.length);

        function pickEndPair(): [number, number] {
            const threshold = P.spreadLength * hs * 0.6;
            const left = positions
                .map((p, i) => ({ i, x: p[0] }))
                .filter((n) => n.x < -threshold);
            const right = positions
                .map((p, i) => ({ i, x: p[0] }))
                .filter((n) => n.x > threshold);
            if (left.length && right.length) {
                return [
                    left[Math.floor(Math.random() * left.length)].i,
                    right[Math.floor(Math.random() * right.length)].i,
                ];
            }
            let best: [number, number] = [0, 1],
                bestD = 0;
            for (let t = 0; t < 40; t++) {
                const a = Math.floor(Math.random() * nodeCount);
                const b = Math.floor(Math.random() * nodeCount);
                if (a === b) continue;
                const d = dist3(positions[a], positions[b]);
                if (d > bestD) {
                    bestD = d;
                    best = [a, b];
                }
            }
            return best;
        }

        function fireSpark() {
            const [a, b] = pickEndPair();
            const path = bfs(adj, a, b);
            if (!path || path.length < 2) return;
            const ek: string[] = [];
            for (let i = 0; i < path.length - 1; i++)
                ek.push(
                    Math.min(path[i], path[i + 1]) +
                        "-" +
                        Math.max(path[i], path[i + 1]),
                );
            sparks.push({
                path,
                edgeKeys: ek,
                wavefront: 0,
                done: false,
                fadeLife: 1,
                speed: P.propagationSpeed,
            });
        }

        let nextSpark =
            performance.now() +
            (-Math.log(1 - Math.random()) / P.sparkLambda) * 1000;
        let last = performance.now();

        function tick(time: number) {
            if (!spinning) {
                last = time;
                return;
            }

            const dt = Math.min((time - last) / 1000, 0.05);
            last = time;

            const ax = time * P.spinSpeed;
            const ay = Math.sin(time * P.wobbleSpeed) * P.wobbleAmp;

            const transform = (p: number[]) => {
                let r = rotX(p, ax);
                r = rotY(r, ay);
                return project(r, P.fov, cx, cy, projScale);
            };

            ctx.clearRect(0, 0, width, height);

            // --- Draw cube ---
            ctx.strokeStyle = cubeColor;
            ctx.globalAlpha = cubeAlpha;
            ctx.lineWidth = cubeLineWidth;
            for (const [a, b] of cubeEdgeIdx) {
                const pa = transform(cubeVerts[a]);
                const pb = transform(cubeVerts[b]);
                ctx.beginPath();
                ctx.moveTo(pa[0], pa[1]);
                ctx.lineTo(pb[0], pb[1]);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // --- Fire sparks ---
            if (time > nextSpark) {
                fireSpark();
                nextSpark =
                    time +
                    (-Math.log(1 - Math.random()) / P.sparkLambda) * 1000;
            }

            // --- Update sparks ---
            edgeGlow.fill(0);

            for (let si = sparks.length - 1; si >= 0; si--) {
                const sp = sparks[si];

                if (!sp.done) {
                    sp.wavefront += dt * sp.speed;
                    const reached = Math.floor(sp.wavefront);
                    for (
                        let ni = 0;
                        ni <= Math.min(reached, sp.path.length - 1);
                        ni++
                    ) {
                        if (nodeGlow[sp.path[ni]] < 0.3)
                            nodeGlow[sp.path[ni]] = 1;
                    }
                    for (
                        let ei = 0;
                        ei < Math.min(reached, sp.edgeKeys.length);
                        ei++
                    ) {
                        const idx = edgeKeyToIdx[sp.edgeKeys[ei]];
                        if (idx !== undefined)
                            edgeGlow[idx] = Math.max(edgeGlow[idx], 1);
                    }
                    if (sp.wavefront >= sp.path.length - 1) sp.done = true;
                } else {
                    sp.fadeLife -= dt * P.sparkFadeSpeed;
                    if (sp.fadeLife <= 0) {
                        sparks.splice(si, 1);
                        continue;
                    }
                    const intensity = sp.fadeLife * sp.fadeLife;
                    sp.edgeKeys.forEach((ek) => {
                        const idx = edgeKeyToIdx[ek];
                        if (idx !== undefined)
                            edgeGlow[idx] = Math.max(edgeGlow[idx], intensity);
                    });
                }
            }

            // --- Draw edges ---
            for (let i = 0; i < edges.length; i++) {
                const [a, b] = edges[i];
                const pa = transform(positions[a]);
                const pb = transform(positions[b]);
                const g = edgeGlow[i];

                if (g > 0.01) {
                    ctx.strokeStyle = sparkColor;
                    ctx.globalAlpha = edgeBaseAlpha + g * 0.6;
                    ctx.lineWidth = 0.6 + g * 1.5;
                } else {
                    ctx.strokeStyle = edgeColor;
                    ctx.globalAlpha = edgeBaseAlpha;
                    ctx.lineWidth = 0.6;
                }

                ctx.beginPath();
                ctx.moveTo(pa[0], pa[1]);
                ctx.lineTo(pb[0], pb[1]);
                ctx.stroke();
            }

            // --- Draw spark bolt lines on top ---
            for (const sp of sparks) {
                for (let ei = 0; ei < sp.edgeKeys.length; ei++) {
                    const reached = Math.floor(sp.wavefront);
                    if (ei >= reached && !sp.done) continue;

                    const [a, b] = sp.edgeKeys[ei].split("-").map(Number);
                    const pa = transform(positions[a]);
                    const pb = transform(positions[b]);
                    const opacity = sp.done
                        ? sp.fadeLife * sp.fadeLife * 0.85
                        : 0.85;

                    ctx.strokeStyle = sparkColor;
                    ctx.globalAlpha = opacity;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(pa[0], pa[1]);
                    ctx.lineTo(pb[0], pb[1]);
                    ctx.stroke();
                }
            }

            // --- Draw nodes ---
            ctx.globalAlpha = 1;
            for (let i = 0; i < positions.length; i++) {
                const pp = transform(positions[i]);
                nodeGlow[i] = Math.max(0, nodeGlow[i] - dt * 1.0);
                const g = nodeGlow[i];
                const color =
                    g > 0.01 ? lerpColor(nodeColor, sparkColor, g) : nodeColor;
                const r = nodeRadius * pp[2] * (1 + g * 1.5);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(pp[0], pp[1], r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // --- ECG canvas setup ---
        let ecgCtx: CanvasRenderingContext2D | null = null;
        let ecgActive = false;
        let ecgPhase2Fired = false;

        if (!compact && ecgCanvas) {
            ecgCtx = ecgCanvas.getContext("2d")!;
            ecgCanvas.width = ECG_W * dpr;
            ecgCanvas.height = ECG_H * dpr;
            ecgCtx.scale(dpr, dpr);
        }

        // --- Waveform helpers ---

        function pqrstAtPosition(xNorm: number): number {
            const center = 0.5;
            const span = 0.18;
            const local = (xNorm - (center - span / 2)) / span;
            if (local < 0 || local > 1) return 0;
            let v = 0;
            if (local > 0.05 && local < 0.2)
                v = Math.sin(((local - 0.05) / 0.15) * Math.PI) * 0.12;
            if (local > 0.28 && local < 0.36)
                v = -Math.sin(((local - 0.28) / 0.08) * Math.PI) * 0.15;
            if (local > 0.36 && local < 0.52)
                v = Math.sin(((local - 0.36) / 0.16) * Math.PI) * 1.0;
            if (local > 0.52 && local < 0.62)
                v = -Math.sin(((local - 0.52) / 0.1) * Math.PI) * 0.25;
            if (local > 0.72 && local < 0.92)
                v = Math.sin(((local - 0.72) / 0.2) * Math.PI) * 0.18;
            return v;
        }

        function microAtPosition(xNorm: number): number {
            if (xNorm > 0.44 && xNorm < 0.56) {
                return Math.sin(((xNorm - 0.44) / 0.12) * Math.PI) * 0.06;
            }
            return 0;
        }

        function drawEcg(time: number) {
            if (!ecgCtx || !ecgActive) return;
            if (ecgStartTime === 0) ecgStartTime = time;
            const t = time - ecgStartTime;

            const ew = ECG_W,
                eh = ECG_H,
                ey = eh / 2;
            const amp = eh * 0.42;

            ecgCtx.clearRect(0, 0, ew, eh);

            // Which sweep are we on? Each sweep = cursor goes left to right
            const sweepIdx = Math.floor(t / ECG_BREATH_MS);
            const sweepT = (t % ECG_BREATH_MS) / ECG_BREATH_MS; // 0..1 cursor progress
            const cursorX = sweepT * ew;

            const isFinal = sweepIdx === ECG_TOTAL_BLIPS; // 3rd sweep (the bright one)
            const isDone = sweepIdx > ECG_TOTAL_BLIPS;  // all sweeps finished

            if (isDone) {
                // Underline persists — bright full-width line
                ecgCtx.strokeStyle = ecgBright;
                ecgCtx.lineWidth = 1.5;
                ecgCtx.beginPath();
                ecgCtx.moveTo(0, ey);
                ecgCtx.lineTo(ew, ey);
                ecgCtx.stroke();
            } else if (isFinal) {
                // 3rd sweep — cursor reveals line, spike fires at center, text rolls in

                // Draw revealed line up to cursor with center spike
                const steps = Math.ceil(cursorX / 1.5);
                if (steps > 0) {
                    ecgCtx.beginPath();
                    for (let i = 0; i <= steps; i++) {
                        const x = (i / Math.ceil(ew / 1.5)) * ew;
                        if (x > cursorX) break;
                        const xN = x / ew;
                        // Full PQRST alive waveform
                        const yOff = pqrstAtPosition(xN) * amp;
                        const y = ey - yOff;
                        if (i === 0) ecgCtx.moveTo(x, y);
                        else ecgCtx.lineTo(x, y);
                    }
                    ecgCtx.strokeStyle = ecgBright;
                    ecgCtx.lineWidth = 1.8;
                    ecgCtx.stroke();
                }

                // Dim line ahead of cursor
                ecgCtx.strokeStyle = ecgDimAhead;
                ecgCtx.lineWidth = 1;
                ecgCtx.beginPath();
                ecgCtx.moveTo(cursorX, ey);
                ecgCtx.lineTo(ew, ey);
                ecgCtx.stroke();

                // Cursor dot + glow
                const cursorXN = cursorX / ew;
                const cursorYOff = pqrstAtPosition(cursorXN) * amp;
                const cursorY = ey - cursorYOff;
                ecgCtx.beginPath();
                ecgCtx.arc(cursorX, cursorY, 2.5, 0, Math.PI * 2);
                ecgCtx.fillStyle = ecgDot;
                ecgCtx.fill();
                const glowR = 14;
                const glow = ecgCtx.createRadialGradient(
                    cursorX, cursorY, 0, cursorX, cursorY, glowR,
                );
                glow.addColorStop(0, ecgGlowIn);
                glow.addColorStop(1, ecgGlowOut);
                ecgCtx.fillStyle = glow;
                ecgCtx.fillRect(
                    cursorX - glowR, cursorY - glowR, glowR * 2, glowR * 2,
                );

                // Text rolls in behind cursor
                if (!showTagline) showTagline = true;
            } else {
                // Micro sweeps (0, 1) — dim with tiny blip
                const steps = Math.ceil(cursorX / 1.5);
                if (steps > 0) {
                    ecgCtx.beginPath();
                    for (let i = 0; i <= steps; i++) {
                        const x = (i / Math.ceil(ew / 1.5)) * ew;
                        if (x > cursorX) break;
                        const xN = x / ew;
                        const yOff = microAtPosition(xN) * amp;
                        const y = ey - yOff;
                        if (i === 0) ecgCtx.moveTo(x, y);
                        else ecgCtx.lineTo(x, y);
                    }
                    ecgCtx.strokeStyle = ecgDim;
                    ecgCtx.lineWidth = 1.0;
                    ecgCtx.stroke();
                }

                // Dim cursor dot
                ecgCtx.beginPath();
                const cursorXN = cursorX / ew;
                const cursorYOff = microAtPosition(cursorXN) * amp;
                ecgCtx.arc(cursorX, ey - cursorYOff, 1.5, 0, Math.PI * 2);
                ecgCtx.fillStyle = ecgDotDim;
                ecgCtx.fill();
            }

            // Flash after 3rd sweep completes
            const finalEnd = (ECG_TOTAL_BLIPS + 1) * ECG_BREATH_MS;
            if (t >= finalEnd && !ecgPhase2Fired) {
                ecgPhase2Fired = true;
                flashActive = true;
                const t2 = setTimeout(() => {
                    flashActive = false;
                }, 400);
                spikeTimers.push(t2);
            }
        }

        raf = requestAnimationFrame(function loop(time: number) {
            tick(time);
            drawEcg(time);
            raf = requestAnimationFrame(loop);
        });

        if (!compact) {
            collapseTimer = setTimeout(() => {
                collapseStarted = true;
                ecgActive = true;
                collapseInterval = setInterval(() => {
                    collapsedCount++;
                    if (collapsedCount >= totalToRemove)
                        clearInterval(collapseInterval);
                }, COLLAPSE_TICK_MS);
            }, 1600);
        }
    });

    onDestroy(() => {
        if (raf) cancelAnimationFrame(raf);
        if (collapseTimer) clearTimeout(collapseTimer);
        if (collapseInterval) clearInterval(collapseInterval);
        spikeTimers.forEach(clearTimeout);
        themeUnsub?.();
    });
</script>

{#if compact}
    <canvas
        bind:this={canvas}
        style="width:{width}px;height:{height}px"
        class="logo-canvas compact"
    ></canvas>
{:else}
    <div class="logo-splash">
        <canvas
            bind:this={canvas}
            style="width:{width}px;height:{height}px"
            class="logo-canvas"
        ></canvas>
        <div class="title-wrap" class:collapsed={collapseStarted}>
            {#each subtitleLetters as letter}
                {#if letter.space}
                    <span
                        class="letter space"
                        class:gone={letter.removeIdx < collapsedCount}
                        >&nbsp;</span
                    >
                {:else if letter.initial}
                    <span class="letter initial">{letter.char}</span>
                {:else}
                    <span
                        class="letter trailing"
                        class:gone={letter.removeIdx < collapsedCount}
                        >{letter.char}</span
                    >
                {/if}
            {/each}
        </div>
        {#if showTagline}
            <div class="subtitle">revive your feed</div>
        {/if}
        <div class="ecg-row">
            <canvas
                bind:this={ecgCanvas}
                style="width:{ECG_W}px;height:{ECG_H}px"
                class="ecg-canvas"
            ></canvas>
            <div class="flash-overlay" class:active={flashActive}></div>
        </div>
    </div>
{/if}

<style>
    .logo-splash {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .logo-canvas {
        overflow: visible;
    }
    .logo-canvas.compact {
        display: block;
    }
    .title-wrap {
        margin-top: 10px;
        display: flex;
        justify-content: center;
        overflow: hidden;
        font-size: 22px;
        font-weight: 500;
        letter-spacing: 4px;
        text-transform: uppercase;
        background: linear-gradient(
            90deg,
            var(--text-muted) 0%,
            var(--text-muted) 35%,
            var(--accent) 50%,
            var(--text-muted) 65%,
            var(--text-muted) 100%
        );
        background-size: 250% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer-sweep 3s ease-in-out infinite;
        transition:
            letter-spacing 0.8s ease-in-out,
            font-size 0.8s ease-in-out,
            font-weight 0.8s ease-in-out;
    }
    .title-wrap.collapsed {
        letter-spacing: 10px;
        font-size: 28px;
        font-weight: 600;
    }
    .subtitle {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 4px;
        text-transform: uppercase;
        color: var(--text-muted);
        opacity: 0;
        animation: subtitle-in 800ms ease-out forwards;
    }
    @keyframes subtitle-in {
        0% {
            opacity: 0;
            letter-spacing: 10px;
        }
        100% {
            opacity: 0.85;
            letter-spacing: 4px;
        }
    }
    .letter {
        display: inline-block;
        overflow: hidden;
        max-width: 1em;
        opacity: 1;
        transition:
            max-width 0.3s ease-in,
            opacity 0.2s ease-in;
    }
    .letter.space {
        max-width: 0.5em;
    }
    .letter.gone {
        max-width: 0;
        opacity: 0;
    }
    .ecg-row {
        position: relative;
        width: 240px;
        height: 48px;
        margin-top: 14px;
    }
    .ecg-canvas {
        display: block;
        width: 100%;
        height: 100%;
    }
    .flash-overlay {
        position: absolute;
        inset: -16px -30px;
        background: radial-gradient(
            ellipse at center,
            rgba(255, 255, 255, 0.9) 0%,
            rgba(255, 255, 255, 0) 70%
        );
        opacity: 0;
        pointer-events: none;
    }
    :global(html[data-theme="light"]) .flash-overlay {
        background: radial-gradient(
            ellipse at center,
            rgba(30, 58, 106, 0.5) 0%,
            rgba(30, 58, 106, 0) 70%
        );
    }
    .flash-overlay.active {
        animation: flash-burst 500ms ease-out forwards;
    }
    @keyframes flash-burst {
        0% {
            opacity: 0;
            transform: scale(0.5);
        }
        20% {
            opacity: 1;
            transform: scale(1.2);
        }
        100% {
            opacity: 0;
            transform: scale(2);
        }
    }
    @keyframes shimmer-sweep {
        0% {
            background-position: 100% 0;
        }
        100% {
            background-position: -100% 0;
        }
    }
</style>
