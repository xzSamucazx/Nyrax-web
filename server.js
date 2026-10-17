'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === 'disable' ? false : (isProduction ? true : undefined) }) : null;

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      formAction: ["'self'"], upgradeInsecureRequests: isProduction ? [] : null,
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '10kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

const sessionOptions = {
  name: 'mk.sid', secret: sessionSecret || crypto.randomBytes(48).toString('hex'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8, path: '/' }
};
if (pool) sessionOptions.store = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true });
app.use(session(sessionOptions));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const configured = () => Boolean(pool && sessionSecret && sessionSecret.length >= 32);
const authUnavailable = (req, res, next) => configured() ? next() : res.status(503).json({ error: 'Autenticação indisponível: configure DATABASE_URL e SESSION_SECRET no ambiente do servidor.' });
function csrf(req, res, next) {
  const supplied = req.get('x-csrf-token');
  const expected = req.session.csrfToken;
  if (!supplied || !expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Sessão expirada. Atualize a página e tente novamente.' });
  }
  next();
}
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function validPassword(value) { return typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value, 'utf8') <= 72; }

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'mk-gaming' }));
app.get('/api/csrf', (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.set('Cache-Control', 'no-store');
  res.json({ token: req.session.csrfToken });
});
app.get('/api/auth/status', authUnavailable, async (req, res, next) => {
  try {
    if (!req.session.userId) return res.json({ authenticated: false });
    const result = await pool.query('SELECT id, email, created_at FROM users WHERE id = $1', [req.session.userId]);
    if (!result.rowCount) { req.session.userId = null; return res.json({ authenticated: false }); }
    res.set('Cache-Control', 'no-store');
    res.json({ authenticated: true, user: result.rows[0] });
  } catch (err) { next(err); }
});
app.post('/api/auth/register', authUnavailable, authLimiter, csrf, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (email.length > 254 || !emailPattern.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
    if (!validPassword(password)) return res.status(400).json({ error: 'A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes em UTF-8.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at', [email, passwordHash]);
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = result.rows[0].id;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.status(201).set('Cache-Control', 'no-store').json({ authenticated: true, user: result.rows[0], csrfToken: req.session.csrfToken });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Não foi possível criar a conta com esses dados. Verifique o e-mail informado.' });
    next(err);
  }
});
app.post('/api/auth/login', authUnavailable, authLimiter, csrf, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!emailPattern.test(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'E-mail ou senha inválidos.' });
    const result = await pool.query('SELECT id, email, password_hash, created_at FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !matches) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.set('Cache-Control', 'no-store').json({ authenticated: true, user: { id: user.id, email: user.email, created_at: user.created_at }, csrfToken: req.session.csrfToken });
  } catch (err) { next(err); }
});
app.post('/api/auth/logout', authUnavailable, csrf, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('mk.sid', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
    res.status(204).end();
  });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], dotfiles: 'deny', index: 'index.html', maxAge: isProduction ? '1h' : 0 }));
app.use((req, res) => res.status(404).json({ error: 'Página ou recurso não encontrado.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Detalhes técnicos ficam somente nos logs do servidor.
  console.error('Request failed:', err && err.message ? err.message : 'unknown error');
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente.' });
});

async function start() {
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }
  app.listen(port, '0.0.0.0', () => console.log(`MK Gaming listening on port ${port}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
