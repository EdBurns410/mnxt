const { v4: uuid } = require('uuid');
const { plans, findPlan } = require('./plans');

const TRIAL_PLAN = findPlan('trial');

class DataStore {
  constructor() {
    this.users = new Map();
  }

  createUser({ name, email, passwordHash }) {
    const existing = this.findUserByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + (TRIAL_PLAN.trialLengthDays || 0) * 24 * 60 * 60 * 1000);

    const user = {
      id: uuid(),
      name,
      email: email.toLowerCase(),
      passwordHash,
      subscription: {
        planId: 'trial',
        status: 'trialing',
        trialEndsAt: TRIAL_PLAN.trialLengthDays ? trialEndsAt.toISOString() : null,
        history: []
      },
      workflows: [],
      history: []
    };

    this.users.set(user.id, user);
    this.recordHistory(user.id, {
      type: 'account_created',
      message: 'Account created and free trial started.',
      timestamp: new Date().toISOString()
    });

    return user;
  }

  findUserByEmail(email) {
    const normalized = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) {
        return user;
      }
    }
    return null;
  }

  getUserById(id) {
    return this.users.get(id) || null;
  }

  upsertWorkflow(userId, workflow) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const plan = findPlan(user.subscription.planId) || TRIAL_PLAN;
    const limits = plan.limits || {};

    const normalized = {
      ...workflow,
      name: workflow.name || 'Untitled workflow',
      description: workflow.description || '',
      documentation: workflow.documentation || '',
      trigger:
        workflow.trigger && workflow.trigger.type
          ? {
              type: workflow.trigger.type,
              config: workflow.trigger.config || {}
            }
          : { type: 'webhook', config: {} },
      steps: Array.isArray(workflow.steps) ? workflow.steps : []
    };

    const existingIndex = user.workflows.findIndex((wf) => wf.id === normalized.id);
    const total = existingIndex === -1 ? user.workflows.length + 1 : user.workflows.length;

    if (limits.workflows && total > limits.workflows) {
      throw new Error(`Your ${plan.name} plan allows up to ${limits.workflows} saved workflows.`);
    }

    if (limits.stepsPerWorkflow && normalized.steps && normalized.steps.length > limits.stepsPerWorkflow) {
      throw new Error(`Your ${plan.name} plan allows up to ${limits.stepsPerWorkflow} steps per workflow.`);
    }

    const record = {
      ...normalized,
      id: normalized.id || uuid(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex === -1) {
      record.createdAt = record.updatedAt;
      user.workflows.push(record);
      this.recordHistory(user.id, {
        type: 'workflow_created',
        message: `Created workflow "${record.name || 'Untitled'}".`,
        workflowId: record.id,
        timestamp: record.updatedAt
      });
    } else {
      const existing = user.workflows[existingIndex];
      record.createdAt = existing.createdAt;
      user.workflows[existingIndex] = record;
      this.recordHistory(user.id, {
        type: 'workflow_updated',
        message: `Updated workflow "${record.name || 'Untitled'}".`,
        workflowId: record.id,
        timestamp: record.updatedAt
      });
    }

    return record;
  }

  deleteWorkflow(userId, workflowId) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const index = user.workflows.findIndex((wf) => wf.id === workflowId);
    if (index === -1) {
      throw new Error('Workflow not found');
    }
    const [removed] = user.workflows.splice(index, 1);
    this.recordHistory(user.id, {
      type: 'workflow_deleted',
      message: `Deleted workflow "${removed.name || 'Untitled'}".`,
      workflowId: removed.id,
      timestamp: new Date().toISOString()
    });
    return removed;
  }

  listWorkflows(userId) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user.workflows;
  }

  updateSubscription(userId, planId, status, metadata = {}) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const plan = findPlan(planId);
    if (!plan) {
      throw new Error('Unknown plan');
    }

    user.subscription = {
      planId: plan.id,
      status,
      activatedAt: new Date().toISOString(),
      ...metadata
    };

    this.recordHistory(user.id, {
      type: 'subscription_updated',
      message: `Subscription switched to ${plan.name} (${status}).`,
      timestamp: new Date().toISOString()
    });

    return user.subscription;
  }

  downgradeIfTrialExpired(user) {
    if (!user.subscription || user.subscription.planId !== 'trial') {
      return;
    }
    if (!user.subscription.trialEndsAt) {
      return;
    }
    const end = new Date(user.subscription.trialEndsAt).getTime();
    if (Number.isNaN(end)) {
      return;
    }
    if (Date.now() > end) {
      user.subscription = {
        planId: 'trial',
        status: 'expired',
        trialEndsAt: user.subscription.trialEndsAt
      };
    }
  }

  recordHistory(userId, entry) {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }
    const record = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      ...entry
    };
    user.history.unshift(record);
    const plan = findPlan(user.subscription.planId) || TRIAL_PLAN;
    const retentionDays = plan?.limits?.historyRetentionDays;
    if (retentionDays) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      user.history = user.history.filter((item) => new Date(item.timestamp).getTime() >= cutoff);
    }
    return record;
  }
}

module.exports = new DataStore();
