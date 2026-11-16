'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { verifyPassword } = require('./passwords');

const SESSION_COOKIE = 'session';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_ITEM_NAME_LENGTH = 50;
const ITEM_NAME_TOO_LONG = 'Name must be 50 characters or fewer.';

function createApp({ pool, signingSecret }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(signingSecret));

  // Signed cookie holds the user's email; tampering invalidates it.
  app.use((req, _res, next) => {
    req.userEmail = req.signedCookies[SESSION_COOKIE] || null;
    next();
  });

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  app.get('/login', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
  app.get('/items', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'items.html')));
  app.use('/static', express.static(PUBLIC_DIR));

  app.post('/login', async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      const { rows } = await pool.query(
        'SELECT email, password_hash FROM users WHERE email = $1',
        [email]
      );
      if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
        return res.redirect(303, '/login?error=1');
      }
      res.cookie(SESSION_COOKIE, rows[0].email, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
      });
      res.redirect(303, '/items');
    } catch (err) {
      next(err);
    }
  });

  app.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/');
  });

  app.get('/api/me', (req, res) => {
    if (!req.userEmail) return res.status(401).json({ error: 'Not signed in' });
    res.json({ email: req.userEmail });
  });

  app.get('/api/items', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, created_at FROM items ORDER BY id'
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/items', async (req, res, next) => {
    try {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (Array.from(name).length > MAX_ITEM_NAME_LENGTH) {
        return res.status(400).json({ error: ITEM_NAME_TOO_LONG });
      }
      const { rows } = await pool.query(
        'INSERT INTO items (name) VALUES ($1) RETURNING id, name, created_at',
        [name]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('Request failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
