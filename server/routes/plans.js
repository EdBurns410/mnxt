const express = require('express');
const { plans } = require('../plans');

const router = express.Router();

router.get('/', (req, res) => {
  const publicPlans = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceMonthly: plan.priceMonthly,
    description: plan.description,
    features: plan.features,
    limits: plan.limits,
    trialLengthDays: plan.trialLengthDays,
    checkoutAvailable: Boolean(plan.stripePriceId)
  }));
  res.json({ plans: publicPlans });
});

module.exports = router;
