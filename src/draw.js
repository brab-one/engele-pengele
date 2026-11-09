import { randomInt } from 'node:crypto';

// Mischt alle zufällig in einen Kreis: jede Person beschenkt die nächste.
// Dadurch zieht niemand sich selbst und es gibt keine "Paare", die sich gegenseitig beschenken.
export function drawPairs(ids) {
  if (ids.length < 2) throw new Error('Für eine Ziehung braucht es mindestens 2 Personen.');
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pairs = new Map();
  order.forEach((id, k) => pairs.set(id, order[(k + 1) % order.length]));
  return pairs;
}
