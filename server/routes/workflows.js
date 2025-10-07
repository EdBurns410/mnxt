const express = require('express');
const store = require('../datastore');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const workflows = store.listWorkflows(req.user.id);
    res.json({ workflows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const workflow = store.upsertWorkflow(req.user.id, req.body || {});
    res.status(201).json({ workflow });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    store.deleteWorkflow(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
