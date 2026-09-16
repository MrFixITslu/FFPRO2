import { canonicalOrigin } from '../config.js';
// Recovery links never derive their destination from untrusted request headers.
export function getFrontendUrl(_req) { return canonicalOrigin(); }
