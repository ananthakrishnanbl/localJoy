// Minimal event bus. Physics/match emit events, effects/phone-link listen.
// Keeps the simulation free of any drawing or networking code.

export function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    emit(evt) {
      const list = handlers.get(evt.type);
      if (list) for (const fn of list) fn(evt);
    },
    clear() {
      handlers.clear();
    },
  };
}
