import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { initBot } from './src/bot/index.ts';
import { userService } from './src/lib/firebase-admin.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON parsing
  app.use(express.json());

  // API Routes
  app.get('/api/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await userService.getProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }
      const vouches = await userService.getVouches(userId);
      res.json({ profile, vouches });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Discord Bot initialization
  console.log('🚀 SYSTEM: Starting TradeForge Bot with Latest Scoped Firebase Config...');
  initBot().catch(console.error);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
