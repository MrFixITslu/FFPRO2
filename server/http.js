import express from 'express';
// Express 4 does not forward rejected async handlers to the error middleware.
export function Router() {
  const router = express.Router();
  const wrap = handler => Array.isArray(handler) ? handler.map(wrap) :
    typeof handler === 'function' && handler.length < 4 ? function(req, res, next) {
      try { Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
    } : handler;
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    const register = router[method].bind(router);
    router[method] = (...args) => register(...args.map(wrap));
  }
  return router;
}
