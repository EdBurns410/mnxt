const plans = [
  {
    id: 'trial',
    name: 'Free Trial',
    priceMonthly: 0,
    description: 'Limited builder access for evaluation with automatic downgrade after the trial period.',
    limits: {
      workflows: 2,
      stepsPerWorkflow: 10,
      historyRetentionDays: 30
    },
    features: [
      'Workflow canvas with starter templates',
      'Save up to two workflows',
      'Export workflow JSON',
      'Community support forum access'
    ],
    trialLengthDays: 14,
    stripePriceId: null
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 49,
    description: 'Unlock advanced automation, more storage, and collaboration tools.',
    limits: {
      workflows: 25,
      stepsPerWorkflow: 100,
      historyRetentionDays: 365
    },
    features: [
      'Unlimited workflow versions',
      'Audit timeline with rich notes',
      'Team seats with role-based access',
      'Priority email support'
    ],
    trialLengthDays: 0,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || null
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 199,
    description: 'Scale complex automations with enterprise-grade governance.',
    limits: {
      workflows: 200,
      stepsPerWorkflow: 1000,
      historyRetentionDays: 3650
    },
    features: [
      'Dedicated success engineer',
      'SAML SSO & advanced security controls',
      'Custom contract & invoicing options',
      'Uptime & compliance reporting'
    ],
    trialLengthDays: 0,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || null
  }
];

function findPlan(planId) {
  return plans.find((plan) => plan.id === planId);
}

module.exports = {
  plans,
  findPlan
};
