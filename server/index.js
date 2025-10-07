require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRouter = require('./routes/auth');
const plansRouter = require('./routes/plans');
const workflowsRouter = require('./routes/workflows');
const billingRouter = require('./routes/billing');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/plans', plansRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/billing', billingRouter);

const staticDir = path.join(__dirname, '..', 'app');
app.use(express.static(staticDir));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.sendFile(path.join(staticDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Workflow Studio server listening on port ${PORT}`);
});
