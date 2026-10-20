/**
 * Puertos de la capa de aplicación. Los adaptadores de infraestructura los implementan;
 * la aplicación solo conoce estas formas.
 *
 * @typedef {object} BestLapRepository
 * @property {() => number | null} load
 * @property {(seconds: number) => void} save
 *
 * @typedef {object} SettingsRepository
 * @property {() => object | null} load
 * @property {(settings: object) => void} save
 *
 * @typedef {object} Haptics
 * @property {(milliseconds: number) => void} pulse
 *
 * @typedef {object} SettingsCatalog
 * @property {string[]} zones
 * @property {string[]} liveries
 * @property {boolean} [prefersReducedMotion]
 */
export {};
