// Web Dashboard Route
// Serves the futuristic command center HTML page

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Serve the dashboard HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../web/index.html'));
});

export default router;
