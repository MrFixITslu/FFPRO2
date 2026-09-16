// A bounded process-wide allocation budget: at most two buffered upload/parsing requests.
let active = 0;
export function uploadGate(req, res, next) {
  if (active >= 2) return res.status(503).json({ error: 'Uploads are busy. Please retry shortly.' });
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  res.once('finish', release); res.once('close', release);
  next();
}
