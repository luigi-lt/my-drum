// Timing judgement for lessons. Times are in seconds on one clock.

export const WINDOWS = { perfect: 0.045, good: 0.09, ok: 0.15 };
export const POINTS = { perfect: 100, good: 70, early: 40, late: 40, miss: 0 };
export const EXTRA_PENALTY = 15;

export function grade(dt) {
  const a = Math.abs(dt);
  if (a <= WINDOWS.perfect) return 'perfect';
  if (a <= WINDOWS.good) return 'good';
  if (a <= WINDOWS.ok) return dt < 0 ? 'early' : 'late';
  return null;
}

export function createScore(total) {
  return { total, perfect: 0, good: 0, early: 0, late: 0, miss: 0, extra: 0, combo: 0, bestCombo: 0, judged: 0 };
}

/**
 * Match a hit against the closest unmatched expected note on the same piece.
 * `notes` items are { t, pieceId, matched }. Returns { note, grade } or null.
 */
export function judgeHit(notes, pieceId, time, score) {
  let best = null;
  let bestAbs = Infinity;
  for (const n of notes) {
    if (n.matched || n.pieceId !== pieceId) continue;
    const a = Math.abs(time - n.t);
    if (a < bestAbs) {
      best = n;
      bestAbs = a;
    }
    if (n.t - time > WINDOWS.ok) break; // notes are sorted by time
  }
  const g = best ? grade(time - best.t) : null;
  if (!g) {
    score.extra++;
    return null;
  }
  best.matched = true;
  score[g]++;
  score.judged++;
  score.combo++;
  score.bestCombo = Math.max(score.bestCombo, score.combo);
  return { note: best, grade: g };
}

/** Mark notes that can no longer be hit as misses. Returns the newly missed notes. */
export function expireMisses(notes, now, score) {
  const missed = [];
  for (const n of notes) {
    if (n.t + WINDOWS.ok >= now) break;
    if (!n.matched) {
      n.matched = true;
      n.missed = true;
      score.miss++;
      score.judged++;
      score.combo = 0;
      missed.push(n);
    }
  }
  return missed;
}

/** Accuracy in percent (0-100), after the penalty for extra hits. */
export function accuracy(score) {
  if (!score.total) return 0;
  const pts =
    score.perfect * POINTS.perfect + score.good * POINTS.good + (score.early + score.late) * POINTS.early - score.extra * EXTRA_PENALTY;
  return Math.max(0, Math.min(100, Math.round(pts / score.total)));
}

export function stars(pct) {
  if (pct >= 95) return 3;
  if (pct >= 80) return 2;
  if (pct >= 60) return 1;
  return 0;
}
