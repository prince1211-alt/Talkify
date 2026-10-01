// Central place that decides which browser origins may talk to this backend.
//
// Allowed origins:
//   1. Every URL listed in FRONTEND_URL (comma separated, e.g.
//      "https://talkify.vercel.app,https://www.talkify.app").
//   2. The backend's own origin (when the built frontend is served by this server).
//   3. http://localhost:* and http://127.0.0.1:* — only when NODE_ENV is not "production".
//
// Requests without an Origin header (curl, Postman, server-to-server, same-origin
// page loads) are not browser cross-origin requests, so they are let through and
// still have to pass the normal JWT auth.

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const normalizeOrigin = (origin) => String(origin).trim().replace(/\/+$/, "").toLowerCase();

const isProduction = () => (process.env.NODE_ENV || "").toLowerCase() === "production";

const getAllowedOrigins = () =>
  (process.env.FRONTEND_URL || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

const isSameOrigin = (origin, host) => {
  if (!host) return false;
  try {
    return new URL(origin).host === String(host).toLowerCase();
  } catch {
    return false;
  }
};

const isOriginAllowed = (origin, host) => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (getAllowedOrigins().includes(normalized)) return true;
  if (!isProduction() && LOCALHOST_RE.test(normalized)) return true;
  return isSameOrigin(normalized, host);
};

// Express: hard-reject requests coming from a browser on a non-allowed site.
// (The cors package alone only hides the response; the request would still run.)
const rejectDisallowedOrigins = (req, res, next) => {
  const origin = req.get("Origin");
  if (isOriginAllowed(origin, req.get("Host"))) return next();
  return res.status(403).json({ success: false, message: "Origin not allowed" });
};

// Express: CORS headers only for allowed origins.
const corsOptionsDelegate = (req, callback) => {
  callback(null, {
    origin: isOriginAllowed(req.get("Origin"), req.get("Host")),
    credentials: true,
  });
};

// Socket.io: runs for both long-polling and WebSocket upgrades
// (browsers do not apply CORS to WebSockets, so this check is required).
const allowSocketRequest = (req, callback) => {
  callback(null, isOriginAllowed(req.headers.origin, req.headers.host));
};

const describeAllowedOrigins = () => {
  const list = getAllowedOrigins();
  const parts = list.length ? list : ["(FRONTEND_URL not set)"];
  if (!isProduction()) parts.push("localhost (development only)");
  parts.push("same origin");
  return parts.join(", ");
};

module.exports = {
  isOriginAllowed,
  rejectDisallowedOrigins,
  corsOptionsDelegate,
  allowSocketRequest,
  describeAllowedOrigins,
  isProduction,
};
