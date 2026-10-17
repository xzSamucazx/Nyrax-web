'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseAnonKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
let supabaseOrigin = "'self'";
try {
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol === 'https:') supabaseOrigin = parsed.origin;
} catch (_) { /* Supabase config stays unavailable until a valid URL is supplied. */ }

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      formAction: ["'self'"], upgradeInsecureRequests: isProduction ? [] : null,
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", 'https://esm.sh'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://esm.sh', 'https://ryclrogodmbviomplsbl.supabase.co', ...(supabaseOrigin !== "'self'" && supabaseOrigin !== 'https://ryclrogodmbviomplsbl.supabase.co' ? [supabaseOrigin] : [])]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '10kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

const configLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' } });

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'mk-gaming' }));
app.get('/api/config', configLimiter, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const validUrl = /^https:\/\//i.test(supabaseUrl) && (() => { try { return new URL(supabaseUrl).protocol === 'https:'; } catch (_) { return false; } })();
  res.json({ supabaseUrl: validUrl ? supabaseUrl : '', supabaseAnonKey: validUrl ? supabaseAnonKey : '', authConfigured: Boolean(validUrl && supabaseAnonKey) });
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  dotfiles: 'deny',
  index: 'index.html',
  maxAge: 0,
  setHeaders(res, filePath) {
    const file = path.basename(filePath);
    if (['index.html', 'app.js', 'supabase-config.js'].includes(file)) {
      // Evita que o navegador continue usando o JavaScript antigo após uma publicação.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use((req, res) => res.status(404).json({ error: 'Página ou recurso não encontrado.' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Detalhes técnicos ficam somente nos logs do servidor.
  console.error('Request failed:', err && err.message ? err.message : 'unknown error');
  res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente.' });
});

function start() {
  app.listen(port, '0.0.0.0', () => console.log(`MK Gaming listening on port ${port}`));
}
start();
