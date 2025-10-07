const express = require('express');
const Stripe = require('stripe');
const store = require('../datastore');
const { findPlan } = require('../plans');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2023-10-16' }) : null;

function ensureStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.' });
  }
  next();
}

router.post('/create-checkout-session', requireAuth, ensureStripe, async (req, res) => {
  const { planId, successUrl, cancelUrl } = req.body || {};
  const plan = findPlan(planId);

  if (!plan || !plan.stripePriceId) {
    return res.status(400).json({ error: 'Selected plan is not available for checkout.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: req.user.email,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1
        }
      ],
      payment_method_types: ['card'],
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic'
        }
      },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: plan.trialLengthDays || undefined,
        metadata: {
          userId: req.user.id,
          planId: plan.id
        }
      },
      metadata: {
        userId: req.user.id,
        planId: plan.id
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/activate', requireAuth, (req, res) => {
  const { planId, status = 'active' } = req.body || {};
  const plan = findPlan(planId);
  if (!plan) {
    return res.status(400).json({ error: 'Unknown plan.' });
  }

  try {
    const subscription = store.updateSubscription(req.user.id, plan.id, status, {
      activatedVia: 'manual-activation-endpoint'
    });
    res.json({ subscription });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
