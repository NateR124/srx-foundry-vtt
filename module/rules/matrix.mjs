/**
 * Core Matrix Rules
 */

/**
 * Stub calculator for Noise based on distance and modifiers.
 */
export function calculateNoise(distance, modifiers = 0) {
  let noise = 0;
  if (distance > 100000) noise = 5;
  else if (distance > 10000) noise = 3;
  else if (distance > 1000) noise = 2;
  else if (distance > 100) noise = 1;
  return Math.max(0, noise + modifiers);
}

/**
 * Pure function state machine for the IC ladder.
 * Returns the list of active IC names given a current Overwatch Score (OS).
 */
export function getActiveIC(currentOS, ladder) {
  if (!ladder || !Array.isArray(ladder)) return [];
  // Find highest OS threshold that has been reached
  const triggered = ladder.filter(step => currentOS >= step.os).sort((a, b) => b.os - a.os);
  return triggered.length > 0 ? triggered[0].ic : [];
}
