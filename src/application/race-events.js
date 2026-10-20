/** Vocabulario de eventos y estados que la presentación puede escuchar sin tocar el dominio. */
export { RaceEvent, RaceStatus } from '../domain/race.js';

export const SessionEvent = Object.freeze({
  WORLD_CHANGED: 'world-changed'
});
