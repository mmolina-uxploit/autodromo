export function createHaptics(navigatorLike = globalThis.navigator) {
  return {
    pulse(milliseconds) {
      try {
        navigatorLike?.vibrate?.(milliseconds);
      } catch {
        /* sin soporte: se omite */
      }
    }
  };
}
