import { apiFetch, apiPost } from './client';
import type {
	CodenamesResponse, ShelfStats, UserProfile, RecsResponse, TimelineResponse,
	FeedResponse, CompareResponse, NeighborhoodResponse, ProjectionMeta,
	ProjectionPointsResponse, ProjectionEdgesResponse, ProjectionNeighborsResponse
} from './types';

export function getCodenames(): Promise<CodenamesResponse> {
	return apiFetch<CodenamesResponse>('/api/codenames');
}

export function getShelfStats(): Promise<ShelfStats> {
	return apiFetch<ShelfStats>('/api/shelf/stats');
}

export function getUserProfile(pk: string, codename?: string): Promise<UserProfile> {
	return apiFetch<UserProfile>(`/api/user/${pk}`, { codename });
}

export function getUserFeed(pk: string, limit = 100): Promise<FeedResponse> {
	return apiFetch<FeedResponse>(`/api/user/${pk}/feed`, { limit });
}

export interface RecsOpts {
	codename?: string;
	limit?: number;
	trust_min?: number;
	model?: string;
	lambda?: number;
	pool_pct?: number;
	personalized?: boolean;
	context?: string;
	context_weight?: number;
	reverse?: boolean;
	include_follows?: boolean;
	exclude_pks?: string;
}

export function getUserRecs(pk: string, opts: RecsOpts = {}): Promise<RecsResponse> {
	return apiFetch<RecsResponse>(`/api/user/${pk}/recs`, opts as Record<string, string | number | boolean>);
}

export interface TimelineOpts {
	codename?: string;
	limit?: number;
	trust_min?: number;
	model?: string;
	lambda?: number;
	context?: string;
	context_weight?: number;
	reverse?: boolean;
	exclude_follows?: boolean;
	exclude_pks?: string;
	pool_start?: number;
	pool_end?: number;
}

export function getUserTimeline(pk: string, opts: TimelineOpts = {}): Promise<TimelineResponse> {
	return apiFetch<TimelineResponse>(`/api/user/${pk}/timeline`, opts as Record<string, string | number | boolean>);
}

export function getUserCompare(pk: string, codename?: string, limit = 20): Promise<CompareResponse> {
	return apiFetch<CompareResponse>(`/api/user/${pk}/compare`, { codename, limit });
}

export function getUserNeighborhood(pk: string, codename?: string, k = 200, projection = 'umap'): Promise<NeighborhoodResponse> {
	return apiFetch<NeighborhoodResponse>(`/api/user/${pk}/neighborhood`, { codename, k, projection });
}

export function getProjectionMeta(codename?: string): Promise<ProjectionMeta> {
	return apiFetch<ProjectionMeta>('/api/projection/meta', { codename });
}

export function getProjectionPoints(codename?: string, fields = 'compact'): Promise<ProjectionPointsResponse> {
	return apiFetch<ProjectionPointsResponse>('/api/projection/points', { codename, fields });
}

export function getProjectionEdges(pubkeys: string[], codename?: string, maxEdges = 500): Promise<ProjectionEdgesResponse> {
	return apiPost<ProjectionEdgesResponse>('/api/projection/edges', { pubkeys, max_edges: maxEdges }, { codename });
}

export function getProjectionNeighbors(pubkeys: string[], k = 8, mode = 'nearest', codename?: string, model = 'fused'): Promise<ProjectionNeighborsResponse> {
	return apiPost<ProjectionNeighborsResponse>('/api/projection/neighbors', { pubkeys, k, mode, model }, { codename });
}
