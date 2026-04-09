import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

interface FSRSCard {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0=New,1=Learning,2=Review,3=Relearning
  last_review: Date | null;
}

// FSRS v5 — simplified implementation without external dep until ts-fsrs is installed
// Based on the open FSRS algorithm (MIT)

const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9;

function forgettingCurve(elapsedDays: number, stability: number): number {
  return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY);
}

function initStability(rating: number): number {
  const w = [0.4, 0.6, 2.4, 5.8]; // w0..w3 from FSRS defaults
  return Math.max(w[rating] ?? 1, 0.1);
}

function initDifficulty(rating: number): number {
  // rating: 0=Again,1=Hard,2=Good,3=Easy
  const d0 = 4 - rating; // maps to 1..4
  return Math.min(Math.max(d0, 1), 10);
}

function nextInterval(stability: number): number {
  const interval =
    (stability / FACTOR) *
    (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.max(Math.round(interval), 1);
}

function scoreToRating(score: number): number {
  if (score < 0.3) return 0; // Again
  if (score < 0.5) return 1; // Hard
  if (score < 0.8) return 2; // Good
  return 3;                  // Easy
}

export async function updateReviewWithFSRS(
  reviewId: string,
  score: number
): Promise<void> {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new Error('Review not found');

  const rating = scoreToRating(score);
  const now = new Date();

  let newStability: number;
  let newDifficulty: number;
  let newState: number;
  let newReps: number;
  let newLapses: number;
  let scheduledDays: number;

  if (!review.fsrsStability) {
    // First review — initialize
    newStability = initStability(rating);
    newDifficulty = initDifficulty(rating);
    newState = rating === 0 ? 1 : 2; // Learning or Review
    newReps = 1;
    newLapses = rating === 0 ? 1 : 0;
  } else {
    const elapsedDays = review.elapsedDays;
    const currentS = review.fsrsStability;
    const currentD = review.fsrsDifficulty ?? 5;
    const retrievability = forgettingCurve(elapsedDays, currentS);

    if (rating === 0) {
      // Again — lapse
      newStability = Math.max(currentS * 0.2, 0.1);
      newDifficulty = Math.min(currentD + 2, 10);
      newState = 3; // Relearning
      newLapses = review.fsrsLapses + 1;
      newReps = review.fsrsReps + 1;
    } else {
      // Hard/Good/Easy — stability update formula
      const hardPenalty = rating === 1 ? 0.8 : 1;
      const easyBonus = rating === 3 ? 1.3 : 1;
      newStability =
        currentS *
        (Math.exp(0.9) *
          (11 - currentD) *
          Math.pow(currentS, -0.1) *
          (Math.exp((1 - retrievability) * 0.2) - 1) *
          hardPenalty *
          easyBonus +
          1);
      newDifficulty = Math.min(
        Math.max(currentD - 0.1 * (rating - 3), 1),
        10
      );
      newState = 2; // Review
      newLapses = review.fsrsLapses;
      newReps = review.fsrsReps + 1;
    }
  }

  scheduledDays = nextInterval(newStability);
  const nextDue = new Date(now.getTime() + scheduledDays * 86400000);

  await prisma.review.update({
    where: { id: reviewId },
    data: {
      nextReviewDate: nextDue,
      retentionScore: score,
      reviewCount: { increment: 1 },
      fsrsStability: newStability,
      fsrsRetrievability: forgettingCurve(0, newStability),
      fsrsDifficulty: newDifficulty,
      fsrsState: newState,
      fsrsReps: newReps,
      fsrsLapses: newLapses,
      scheduledDays,
      elapsedDays: 0,
      lastReview: now,
      interval: scheduledDays,
      easeFactor: newStability, // compatibility field
    },
  });

  logger.info('FSRS review updated', { reviewId, rating, scheduledDays });
}
