export interface Codename {
	id: string;
	icon: string;
	name: string;
	desc: string;
	training_window: Record<string, string>;
	trained_at: string;
	events: number;
	pubkeys: number;
	embedding_dim: number;
	has_fused: boolean;
	has_graperank: boolean;
}

export interface CodenamesResponse {
	codenames: Codename[];
	default: string;
}

export interface ShelfStats {
	available: boolean;
	min_ts: number;
	max_ts: number;
	total: number;
	pubkey_count: number;
	day_start: number;
	day_seconds: number;
	daily_counts: number[];
}

export interface UserProfile {
	pubkey: string;
	codename: string;
	name: string;
	picture: string;
	nip05: string;
	about: string;
	g_score: number;
	confidence: number;
	note_count: number;
	following_count: number;
	has_profile: boolean;
	has_semantic_profile: boolean;
	has_fused_profile: boolean;
	community_id: number | null;
	alpha: number | null;
	engagement: {
		reacts_in: number;
		reacts_out: number;
		zaps_in: number;
		zaps_in_sats: number;
		zaps_out: number;
		zaps_out_sats: number;
	};
}

export interface RecItem {
	pubkey: string;
	score: number;
	similarity: number;
	g_score: number;
	note_count: number;
	name: string;
	picture: string;
	nip05: string;
	about: string;
	reacts_in: number;
	zaps_in_sats: number;
	ego_trust?: number;
}

export interface RecsResponse {
	pubkey: string;
	codename: string;
	model: string;
	trust_min: number;
	lambda: number;
	pool_pct: number;
	personalized: boolean;
	reverse: boolean;
	context: string;
	context_weight: number;
	count: number;
	recs: RecItem[];
}

export interface NoteItem {
	id: string;
	pubkey: string;
	kind: number;
	created_at: number;
	content: string;
	g_score: number;
	distance: number;
	score: number;
	author_name: string;
	author_picture: string;
}

export interface TimelineResponse {
	pubkey: string;
	codename: string;
	model: string;
	trust_min: number;
	lambda: number;
	context: string;
	context_weight: number;
	reverse: boolean;
	pool_start: number | null;
	pool_end: number | null;
	count: number;
	notes: NoteItem[];
}

export interface CompareResponse {
	pubkey: string;
	codename: string;
	alpha: number;
	g_score: number;
	semantic_recs: RecItem[];
	fused_recs: RecItem[];
	overlap: number;
	rank_correlation: number;
}

export interface NeighborhoodPoint {
	pubkey: string;
	pk_short: string;
	x: number;
	y: number;
	name: string;
	picture: string;
	g_score: number;
	community: number | null;
	alpha: number | null;
	engagement: number;
	note_count: number;
	dominant_topic: string;
	distance_2d: number;
	is_center: boolean;
}

export interface NeighborhoodResponse {
	center: string;
	projection: string;
	count: number;
	points: NeighborhoodPoint[];
	meta: ProjectionMeta;
}

export interface ProjectionMeta {
	available?: boolean;
	n_users: number;
	projections: string[];
	color_fields: string[];
	timestamp: string;
	label: string;
	pca_variance: [number, number];
}

export interface ProjectionPoint {
	pk: string;
	pk_full: string;
	pca_x: number;
	pca_y: number;
	umap_x?: number;
	umap_y?: number;
	g_score: number;
	engagement: number;
	note_count: number;
	dominant_topic: string;
	name: string;
	picture?: string;
	alpha?: number;
	community?: number;
}

export interface ProjectionPointsResponse {
	meta: ProjectionMeta;
	count: number;
	points: ProjectionPoint[];
}

export interface ProjectionEdge {
	source: string;
	target: string;
}

export interface ProjectionEdgesResponse {
	edges: ProjectionEdge[];
	count: number;
}

export interface NeighborEntry {
	pubkey: string;
	similarity: number;
}

export interface ProjectionNeighborsResponse {
	neighbors: Record<string, NeighborEntry[]>;
}

export interface FeedNote {
	id: string;
	kind: number;
	created_at: number;
	content: string;
	content_length: number;
}

export interface FeedResponse {
	pubkey: string;
	count: number;
	notes: FeedNote[];
}
