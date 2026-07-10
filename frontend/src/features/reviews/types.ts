/**
 * Tipos del dominio Reviews (contrato §Reseñas).
 *
 * POST /reviews (rate-limit 20/día, una por par, solo sobre match completed en 7 días).
 * GET  /reviews?user_id=&limit=&before= (paginado por cursor).
 * DELETE /reviews/{id} (solo autor).
 */
import type { ReviewFlag } from '../../types/enums';

export type { ReviewFlag };

export interface ReviewIn {
  match_id: string;
  reviewee_id: string;
  /** 1..5 */
  rating: number;
  /** max 1000, opcional. */
  comment?: string | null;
  flag?: ReviewFlag | null;
}

export interface ReviewOut {
  id: string;
  match_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  flag: ReviewFlag | null;
  created_at: string; // ISO 8601
}

/** Reviewer embebido en GET /reviews. */
export interface ReviewerSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}

export type ReviewWithReviewer = ReviewOut & {
  reviewer: ReviewerSummary;
};
