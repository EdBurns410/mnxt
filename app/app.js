const API_BASE = '';
const STORAGE_KEY = 'workflow-studio-auth';
const PENDING_PLAN_KEY = 'workflow-studio-pending-plan';

const TRIGGER_TEMPLATES = {
  webhook: {
    label: 'Webhook',
    description: 'Receive external payloads at a dedicated endpoint.',
    fields: [
      { key: 'path', label: 'Endpoint path', type: 'text', placeholder: '/webhooks/leads' },
      { key: 'method', label: 'HTTP method', type: 'select', options: ['POST', 'PUT'] },
      { key: 'auth', label: 'Authentication', type: 'select', options: ['None', 'API key', 'Basic auth'] }
    ]
  },
  schedule: {
    label: 'Scheduled job',
    description: 'Execute on an interval with timezone-aware cron.',
    fields: [
      { key: 'cron', label: 'CRON expression', type: 'text', placeholder: '0 9 * * 1-5' },
      { key: 'timezone', label: 'Timezone', type: 'text', placeholder: 'UTC' }
    ]
  },
  appEvent: {
    label: 'App event',
    description: 'React to events from SaaS tools and internal systems.',
    fields: [
      { key: 'app', label: 'Application', type: 'select', options: ['Salesforce', 'HubSpot', 'Slack', 'Zendesk'] },
      { key: 'event', label: 'Event name', type: 'text', placeholder: 'Lead created' }
    ]
  },
  manual: {
    label: 'Manual trigger',
    description: 'Allow operators to run workflows on-demand.',
    fields: [
      { key: 'instructions', label: 'Runbook instructions', type: 'textarea', rows: 4 }
    ]
  }
};

const STEP_TEMPLATES = {
  httpRequest: {
    label: 'HTTP request',
    description: 'Call external APIs and use the response downstream.',
    icon: '🌐',
    fields: [
      { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/v1/resource' },
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', rows: 3, placeholder: '{"Authorization":"Bearer token"}' },
      { key: 'body', label: 'Body (JSON)', type: 'textarea', rows: 4 }
    ]
  },
  transformData: {
    label: 'Transform data',
    description: 'Write scripts to map and enrich payloads.',
    icon: '🧠',
    fields: [
      { key: 'language', label: 'Language', type: 'select', options: ['JavaScript', 'Python'] },
      { key: 'script', label: 'Transformation snippet', type: 'textarea', rows: 5 }
    ]
  },
  sendEmail: {
    label: 'Send email',
    description: 'Send transactional emails via ESP providers.',
    icon: '✉️',
    fields: [
      { key: 'provider', label: 'Provider', type: 'select', options: ['SendGrid', 'Mailgun', 'Postmark'] },
      { key: 'to', label: 'Recipients', type: 'text', placeholder: 'ops@example.com' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'body', label: 'Body (Markdown)', type: 'textarea', rows: 5 }
    ]
  },
  slackMessage: {
    label: 'Slack message',
    description: 'Notify channels or teammates in Slack.',
    icon: '💬',
    fields: [
      { key: 'channel', label: 'Channel', type: 'text', placeholder: '#automation-alerts' },
      { key: 'message', label: 'Message', type: 'textarea', rows: 4 }
    ]
  },
  wait: {
    label: 'Delay',
    description: 'Pause for a duration before continuing.',
    icon: '⏱️',
    fields: [
      { key: 'duration', label: 'Duration', type: 'number', min: 0, placeholder: '10' },
      { key: 'unit', label: 'Unit', type: 'select', options: ['seconds', 'minutes', 'hours', 'days'] }
    ]
  }
};

const state = {
  token: null,
  user: null,
  plans: [],
  workflows: [],
  currentWorkflow: null,
  history: []
};

const elements = {
  views: {
    landing: document.getElementById('landing'),
    auth: document.getElementById('auth'),
    dashboard: document.getElementById('dashboard')
  },
  planGrid: document.getElementById('plan-grid'),
  planSection: document.getElementById('plan-section'),
  accountDetails: document.getElementById('account-details'),
  subscriptionOptions: document.getElementById('subscription-options'),
  workflowList: document.getElementById('workflow-list'),
  historyList: document.getElementById('history-list'),
  triggerOptions: document.getElementById('trigger-options'),
  triggerForm: document.getElementById('trigger-form'),
  metadataForm: document.getElementById('metadata-form'),
  documentationNotes: document.getElementById('documentation-notes'),
  stepsContainer: document.getElementById('steps-container'),
  exportOutput: document.getElementById('export-output'),
  builderTitle: document.getElementById('builder-title'),
  builderSubtitle: document.getElementById('builder-subtitle'),
  authStatus: document.getElementById('auth-status')
};

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const yearEl = document.getElementById('year');

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyWorkflow() {
  return {
    id: null,
    name: 'Untitled workflow',
    description: '',
    owner: '',
    category: 'ops',
    trigger: {
      type: 'webhook',
      config: {}
    },
    steps: [],
    documentation: ''
  };
}

function switchView(view) {
  Object.entries(elements.views).forEach(([key, el]) => {
    el.classList.toggle('active', key === view);
    if (key === 'auth' && key !== view) {
      elements.authStatus.textContent = '';
    }
  });
}

function setAuthStatus(message, type = 'error') {
  elements.authStatus.textContent = message || '';
  elements.authStatus.style.color = type === 'error' ? '#f87171' : '#34d399';
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) {
    return null;
  }
  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error || 'Request failed';
    throw new Error(message);
  }
  return payload;
}

function persistSession() {
  if (state.token && state.user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, user: state.user }));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function restoreSession() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return;
    const parsed = JSON.parse(value);
    state.token = parsed.token;
    state.user = parsed.user;
  } catch (err) {
    console.warn('Unable to restore session', err);
  }
}

function updateAccountPanel() {
  if (!state.user) {
    elements.accountDetails.innerHTML = '';
    elements.subscriptionOptions.innerHTML = '';
    return;
  }

  const sub = state.user.subscription || {};
  const plan = state.plans.find((p) => p.id === sub.planId);
  const trialStatus = sub.status === 'trialing' && sub.trialEndsAt
    ? `Trial ends ${new Date(sub.trialEndsAt).toLocaleDateString()}`
    : sub.status === 'expired'
    ? 'Trial expired - upgrade to continue saving new workflows.'
    : '';

  elements.accountDetails.innerHTML = `
    <p><strong>${state.user.name}</strong></p>
    <p>${state.user.email}</p>
    <p>Plan: <strong>${plan ? plan.name : sub.planId || 'Unknown'}</strong></p>
    ${trialStatus ? `<p>${trialStatus}</p>` : ''}
    <p>Saved workflows: ${state.workflows.length}</p>
  `;

  renderSubscriptionOptions();
}

function renderSubscriptionOptions() {
  if (!state.user) return;
  const activePlan = state.user.subscription?.planId;
  elements.subscriptionOptions.innerHTML = '';
  state.plans
    .filter((plan) => plan.id !== 'trial')
    .forEach((plan) => {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = plan.id === activePlan ? `Current plan: ${plan.name}` : `Upgrade to ${plan.name}`;
      button.disabled = plan.id === activePlan;
      button.addEventListener('click', () => handleCheckout(plan));
      const info = document.createElement('div');
      info.className = 'plan-option';
      info.innerHTML = `
        <p><strong>${plan.name}</strong> – $${plan.priceMonthly}/month</p>
        <p>${plan.description}</p>
      `;
      elements.subscriptionOptions.append(info, button);
    });
}

function renderPlans() {
  elements.planGrid.innerHTML = '';
  state.plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = 'plan-card';
    card.innerHTML = `
      <h3>${plan.name}</h3>
      <p class="price">${plan.priceMonthly ? `$${plan.priceMonthly}/mo` : 'Free'}</p>
      <p>${plan.description}</p>
      <ul>${plan.features.map((f) => `<li>${f}</li>`).join('')}</ul>
      <p class="limits">Workflows: ${plan.limits.workflows || 'Unlimited'} · Steps per workflow: ${plan.limits.stepsPerWorkflow || 'Unlimited'}</p>
    `;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = plan.id === 'trial' ? 'Start free trial' : 'Subscribe';
    btn.addEventListener('click', () => {
      if (plan.id === 'trial') {
        switchView('auth');
        focusTab('register');
      } else {
        switchView(state.user ? 'dashboard' : 'auth');
        if (!state.user) {
          focusTab('register');
        } else {
          handleCheckout(plan);
        }
      }
    });
    card.appendChild(btn);
    elements.planGrid.appendChild(card);
  });
}

function focusTab(tab) {
  document.querySelectorAll('.tab').forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle('active', isActive);
  });
  loginForm.classList.toggle('visible', tab === 'login');
  registerForm.classList.toggle('visible', tab === 'register');
}

function bindNav() {
  document.querySelectorAll('[data-action="open-auth"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView('auth');
      focusTab('login');
    });
  });

  document.querySelectorAll('[data-action="start-trial"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView('auth');
      focusTab('register');
    });
  });

  const showPlans = document.querySelector('[data-action="show-plans"]');
  if (showPlans) {
    showPlans.addEventListener('click', () => {
      elements.planSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const closeAuth = document.querySelector('[data-action="close-auth"]');
  if (closeAuth) {
    closeAuth.addEventListener('click', () => {
      switchView('landing');
    });
  }

  const logout = document.querySelector('[data-action="logout"]');
  if (logout) {
    logout.addEventListener('click', () => {
      state.token = null;
      state.user = null;
      state.workflows = [];
      state.currentWorkflow = createEmptyWorkflow();
      state.history = [];
      persistSession();
      renderWorkflows();
      renderHistory();
      updateAccountPanel();
      switchView('landing');
    });
  }

  const newWorkflowBtn = document.querySelector('[data-action="new-workflow"]');
  if (newWorkflowBtn) {
    newWorkflowBtn.addEventListener('click', () => {
      state.currentWorkflow = createEmptyWorkflow();
      renderCurrentWorkflow();
    });
  }

  const saveWorkflowBtn = document.querySelector('[data-action="save-workflow"]');
  if (saveWorkflowBtn) {
    saveWorkflowBtn.addEventListener('click', async () => {
      if (!state.user) return;
      try {
        const workflow = buildWorkflowFromForms();
        const payload = await api('/api/workflows', { method: 'POST', body: workflow });
        const saved = payload.workflow;
      const index = state.workflows.findIndex((wf) => wf.id === saved.id);
      if (index === -1) {
        state.workflows.push(saved);
      } else {
        state.workflows[index] = saved;
      }
      state.currentWorkflow = saved;
      renderWorkflows();
      renderCurrentWorkflow();
      await refreshHistory();
      elements.exportOutput.value = JSON.stringify(saved, null, 2);
      showToast('Workflow saved successfully.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const addStepBtn = document.querySelector('[data-action="add-step"]');
  if (addStepBtn) {
    addStepBtn.addEventListener('click', () => {
      openStepPicker();
    });
  }

  const exportBtn = document.querySelector('[data-action="export-json"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!state.currentWorkflow) return;
      const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(state.currentWorkflow, null, 2))}`;
      const link = document.createElement('a');
      link.href = dataStr;
      link.download = `${state.currentWorkflow.name.replace(/\s+/g, '-') || 'workflow'}.json`;
      link.click();
    });
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('visible');
  }, 10);
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function buildWorkflowFromForms() {
  const formData = new FormData(elements.metadataForm);
  const workflow = {
    ...(state.currentWorkflow || createEmptyWorkflow()),
    name: formData.get('name') || 'Untitled workflow',
    description: formData.get('description') || '',
    owner: formData.get('owner') || '',
    category: formData.get('category') || 'ops',
    documentation: elements.documentationNotes.value || ''
  };

  workflow.trigger = {
    type: state.currentWorkflow?.trigger?.type || 'webhook',
    config: collectFormValues(elements.triggerForm)
  };

  workflow.steps = state.currentWorkflow.steps.map((step) => ({
    ...step,
    config: collectFormValues(document.querySelector(`[data-step-id="${step.id}"] form`))
  }));

  return workflow;
}

function collectFormValues(form) {
  if (!form) return {};
  const formData = new FormData(form);
  const values = {};
  for (const [key, value] of formData.entries()) {
    values[key] = value;
  }
  return values;
}

function renderCurrentWorkflow() {
  if (!state.currentWorkflow) {
    state.currentWorkflow = createEmptyWorkflow();
  }
  const wf = state.currentWorkflow;
  if (!wf.trigger) {
    wf.trigger = { type: 'webhook', config: {} };
  }
  if (!Array.isArray(wf.steps)) {
    wf.steps = [];
  }
  elements.metadataForm.elements.name.value = wf.name || '';
  elements.metadataForm.elements.description.value = wf.description || '';
  elements.metadataForm.elements.owner.value = wf.owner || '';
  elements.metadataForm.elements.category.value = wf.category || 'ops';
  elements.documentationNotes.value = wf.documentation || '';

  renderTriggerOptions();
  renderTriggerForm();
  renderSteps();

  elements.exportOutput.value = JSON.stringify(wf, null, 2);
}

function renderTriggerOptions() {
  elements.triggerOptions.innerHTML = '';
  Object.entries(TRIGGER_TEMPLATES).forEach(([type, template]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'option-item';
    item.innerHTML = `<div><h4>${template.label}</h4><p>${template.description}</p></div>`;
    item.classList.toggle('active', state.currentWorkflow.trigger.type === type);
    item.addEventListener('click', () => {
      state.currentWorkflow.trigger = {
        type,
        config: {}
      };
      renderTriggerOptions();
      renderTriggerForm();
    });
    elements.triggerOptions.appendChild(item);
  });
}

function renderTriggerForm() {
  const trigger = state.currentWorkflow.trigger;
  const template = TRIGGER_TEMPLATES[trigger.type];
  elements.triggerForm.innerHTML = '';
  template.fields.forEach((field) => {
    const wrapper = document.createElement('label');
    wrapper.textContent = field.label;
    const input = createFieldInput(field, trigger.config[field.key]);
    input.name = field.key;
    wrapper.appendChild(input);
    elements.triggerForm.appendChild(wrapper);
  });
  elements.triggerForm.oninput = () => {
    state.currentWorkflow.trigger.config = collectFormValues(elements.triggerForm);
    elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
  };
}

function renderSteps() {
  elements.stepsContainer.innerHTML = '';
  state.currentWorkflow.steps.forEach((step, index) => {
    const template = STEP_TEMPLATES[step.type];
    const card = document.createElement('div');
    card.className = 'step-card';
    card.dataset.stepId = step.id;
    card.innerHTML = `
      <header>
        <h4>${template.icon} ${step.name || template.label}</h4>
        <button type="button" class="remove-step">Remove</button>
      </header>
      <form class="step-fields"></form>
    `;
    const form = card.querySelector('form');
    template.fields.forEach((field) => {
      const wrapper = document.createElement('label');
      wrapper.textContent = field.label;
      const input = createFieldInput(field, step.config?.[field.key]);
      input.name = field.key;
      wrapper.appendChild(input);
      form.appendChild(wrapper);
    });
    form.addEventListener('input', () => {
      state.currentWorkflow.steps[index].config = collectFormValues(form);
      elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
    });
    card.querySelector('.remove-step').addEventListener('click', () => {
      state.currentWorkflow.steps.splice(index, 1);
      renderSteps();
      elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
    });
    elements.stepsContainer.appendChild(card);
  });
}

function createFieldInput(field, value) {
  let el;
  const initialValue = value ?? '';
  switch (field.type) {
    case 'textarea': {
      el = document.createElement('textarea');
      el.rows = field.rows || 3;
      el.value = initialValue;
      break;
    }
    case 'select': {
      el = document.createElement('select');
      (field.options || []).forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        opt.selected = option === initialValue;
        el.appendChild(opt);
      });
      break;
    }
    case 'number': {
      el = document.createElement('input');
      el.type = 'number';
      if (field.min !== undefined) el.min = field.min;
      if (field.step !== undefined) el.step = field.step;
      el.value = initialValue;
      break;
    }
    default: {
      el = document.createElement('input');
      el.type = 'text';
      el.value = initialValue;
    }
  }
  if (field.placeholder) {
    el.placeholder = field.placeholder;
  }
  if (field.rows) {
    el.rows = field.rows;
  }
  return el;
}

function openStepPicker() {
  const existing = elements.stepsContainer.querySelector('.step-picker');
  if (existing) existing.remove();
  const picker = document.createElement('div');
  picker.className = 'step-picker';
  picker.innerHTML = `<h4>Select a step template</h4>`;
  Object.entries(STEP_TEMPLATES).forEach(([type, template]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<strong>${template.icon} ${template.label}</strong><span>${template.description}</span>`;
    button.addEventListener('click', () => {
      state.currentWorkflow.steps.push({
        id: randomId('step'),
        type,
        name: template.label,
        config: {}
      });
      renderSteps();
      elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
      picker.remove();
    });
    picker.appendChild(button);
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => picker.remove());
  picker.appendChild(cancel);
  elements.stepsContainer.prepend(picker);
}

function renderWorkflows() {
  elements.workflowList.innerHTML = '';
  if (!state.workflows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No workflows saved yet.';
    elements.workflowList.appendChild(empty);
    return;
  }

  state.workflows
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((workflow) => {
      const item = document.createElement('li');
      item.classList.toggle('active', state.currentWorkflow?.id === workflow.id);
      const meta = document.createElement('div');
      meta.className = 'workflow-meta';
      meta.innerHTML = `
        <div>
          <strong>${workflow.name}</strong>
          <div class="timestamp">Updated ${new Date(workflow.updatedAt).toLocaleString()}</div>
        </div>
      `;
      const actions = document.createElement('div');
      const loadBtn = document.createElement('button');
      loadBtn.className = 'secondary';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => {
        state.currentWorkflow = JSON.parse(JSON.stringify(workflow));
        renderCurrentWorkflow();
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this workflow?')) return;
        try {
          await api(`/api/workflows/${workflow.id}`, { method: 'DELETE' });
          state.workflows = state.workflows.filter((wf) => wf.id !== workflow.id);
          if (state.currentWorkflow?.id === workflow.id) {
            state.currentWorkflow = createEmptyWorkflow();
          }
          renderWorkflows();
          renderCurrentWorkflow();
          await refreshHistory();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      actions.append(loadBtn, deleteBtn);
      meta.appendChild(actions);
      item.appendChild(meta);
      elements.workflowList.appendChild(item);
    });
}

function renderHistory() {
  elements.historyList.innerHTML = '';
  if (!state.history.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No history yet.';
    elements.historyList.appendChild(empty);
    return;
  }
  state.history.forEach((entry) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <strong>${entry.message}</strong>
      <time>${new Date(entry.timestamp).toLocaleString()}</time>
    `;
    elements.historyList.appendChild(item);
  });
}

async function refreshWorkflows() {
  if (!state.user) return;
  try {
    const payload = await api('/api/workflows');
    state.workflows = payload.workflows || [];
    renderWorkflows();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function refreshHistory() {
  if (!state.user) return;
  try {
    const payload = await api('/api/auth/history');
    state.history = payload.history || [];
    renderHistory();
  } catch (err) {
    console.error(err);
  }
}

async function fetchPlans() {
  try {
    const payload = await api('/api/plans');
    state.plans = payload.plans;
    renderPlans();
    updateAccountPanel();
  } catch (err) {
    console.error(err);
  }
}

async function loadUserFromServer() {
  if (!state.token) return;
  try {
    const payload = await api('/api/auth/me');
    state.user = payload.user;
    persistSession();
  } catch (err) {
    state.token = null;
    state.user = null;
    persistSession();
  }
}

async function handleCheckout(plan) {
  if (!state.user) {
    switchView('auth');
    focusTab('login');
    return;
  }
  if (!plan.checkoutAvailable) {
    showToast('Contact sales to activate this plan.', 'error');
    return;
  }
  try {
    const successUrl = `${window.location.origin}?checkout=success`;
    const cancelUrl = `${window.location.origin}?checkout=cancel`;
    const payload = await api('/api/billing/create-checkout-session', {
      method: 'POST',
      body: { planId: plan.id, successUrl, cancelUrl }
    });
    localStorage.setItem(PENDING_PLAN_KEY, plan.id);
    window.location.href = payload.checkoutUrl;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('checkout');
  if (!status) return;

  params.delete('checkout');
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, newUrl);

  if (status === 'cancel') {
    showToast('Checkout cancelled.', 'error');
    localStorage.removeItem(PENDING_PLAN_KEY);
    return;
  }

  if (status === 'success') {
    const planId = localStorage.getItem(PENDING_PLAN_KEY);
    if (!planId || !state.user) {
      showToast('Checkout complete. Log in to apply your subscription.', 'success');
      localStorage.removeItem(PENDING_PLAN_KEY);
      return;
    }
    try {
      const payload = await api('/api/billing/activate', {
        method: 'POST',
        body: { planId, status: 'active' }
      });
      state.user.subscription = payload.subscription;
      persistSession();
      updateAccountPanel();
      showToast('Subscription activated.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      localStorage.removeItem(PENDING_PLAN_KEY);
    }
  }
}

function handleAuthForms() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      focusTab(tab.dataset.tab);
    });
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(loginForm);
      const payload = await api('/api/auth/login', {
        method: 'POST',
        body: {
          email: formData.get('email'),
          password: formData.get('password')
        }
      });
      state.token = payload.token;
      state.user = payload.user;
      state.currentWorkflow = createEmptyWorkflow();
      persistSession();
      switchView('dashboard');
      renderCurrentWorkflow();
      await refreshWorkflows();
      await refreshHistory();
      updateAccountPanel();
      setAuthStatus('Logged in successfully.', 'success');
    } catch (err) {
      setAuthStatus(err.message, 'error');
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(registerForm);
      const payload = await api('/api/auth/register', {
        method: 'POST',
        body: {
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password')
        }
      });
      state.token = payload.token;
      state.user = payload.user;
      state.currentWorkflow = createEmptyWorkflow();
      persistSession();
      switchView('dashboard');
      renderCurrentWorkflow();
      await refreshWorkflows();
      await refreshHistory();
      updateAccountPanel();
      setAuthStatus('Welcome to the free trial! Start building your first workflow.', 'success');
    } catch (err) {
      setAuthStatus(err.message, 'error');
    }
  });
}

function initializeForms() {
  elements.metadataForm.addEventListener('input', () => {
    if (!state.currentWorkflow) return;
    const formData = new FormData(elements.metadataForm);
    state.currentWorkflow.name = formData.get('name');
    state.currentWorkflow.description = formData.get('description');
    state.currentWorkflow.owner = formData.get('owner');
    state.currentWorkflow.category = formData.get('category');
    elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
  });

  elements.documentationNotes.addEventListener('input', () => {
    if (!state.currentWorkflow) return;
    state.currentWorkflow.documentation = elements.documentationNotes.value;
    elements.exportOutput.value = JSON.stringify(state.currentWorkflow, null, 2);
  });
}

function init() {
  yearEl.textContent = new Date().getFullYear();
  restoreSession();
  bindNav();
  handleAuthForms();
  initializeForms();
  fetchPlans();
  if (state.token) {
    loadUserFromServer().then(async () => {
      if (state.user) {
        state.currentWorkflow = createEmptyWorkflow();
        switchView('dashboard');
        renderCurrentWorkflow();
        await refreshWorkflows();
        await refreshHistory();
        updateAccountPanel();
        await handleCheckoutReturn();
      }
    });
  } else {
    switchView('landing');
    handleCheckoutReturn();
  }
  renderCurrentWorkflow();
}

init();
