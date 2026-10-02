// Autopay Recovery Voice Agent Client Application
(function () {
  let customers = [];
  let selectedCustomer = null;
  let activeCallSid = null;
  let pollInterval = null;

  // DOM Elements
  const customersTableBody = document.getElementById('customersTableBody');
  const customerSearchInput = document.getElementById('customerSearchInput');
  const refreshBtn = document.getElementById('refreshBtn');
  const telephonyStatusPill = document.getElementById('telephonyStatusPill');
  const telephonyStatusText = document.getElementById('telephonyStatusText');

  const statTotalCustomers = document.getElementById('statTotalCustomers');
  const statFailedAutopay = document.getElementById('statFailedAutopay');
  const statRetries = document.getElementById('statRetries');
  const statAlternative = document.getElementById('statAlternative');

  const noCustomerSelected = document.getElementById('noCustomerSelected');
  const customerSelectedContent = document.getElementById('customerSelectedContent');
  const selectedCustomerTitle = document.getElementById('selectedCustomerTitle');
  const selectedCustomerSubtitle = document.getElementById('selectedCustomerSubtitle');
  const selectedCustomerBadge = document.getElementById('selectedCustomerBadge');

  const custDetailId = document.getElementById('custDetailId');
  const custDetailName = document.getElementById('custDetailName');
  const custDetailPhone = document.getElementById('custDetailPhone');
  const custDetailAmount = document.getElementById('custDetailAmount');
  const custDetailDueDate = document.getElementById('custDetailDueDate');
  const custDetailOutcome = document.getElementById('custDetailOutcome');

  const btnInitiateCall = document.getElementById('btnInitiateCall');
  const btnInitiateCallText = document.getElementById('btnInitiateCallText');
  const callNotice = document.getElementById('callNotice');

  const simSpeechInput = document.getElementById('simSpeechInput');
  const btnSendSimInput = document.getElementById('btnSendSimInput');
  const transcriptFeed = document.getElementById('transcriptFeed');
  const transcriptCount = document.getElementById('transcriptCount');

  // Initialize
  async function init() {
    bindEvents();
    await checkHealth();
    await fetchCustomers();
    // Auto-select first customer for convenience
    if (customers.length > 0) {
      selectCustomer(customers[0].id);
    }
  }

  function bindEvents() {
    refreshBtn.addEventListener('click', () => {
      fetchCustomers();
      if (selectedCustomer) loadCustomerCalls(selectedCustomer.id);
    });

    customerSearchInput.addEventListener('input', (e) => {
      renderTable(e.target.value.trim().toLowerCase());
    });

    btnInitiateCall.addEventListener('click', () => {
      if (selectedCustomer) initiateCall(selectedCustomer.id);
    });

    btnSendSimInput.addEventListener('click', () => {
      submitSimulatedTurn();
    });

    simSpeechInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitSimulatedTurn();
    });

    // Quick chips
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const phrase = e.target.getAttribute('data-phrase');
        simSpeechInput.value = phrase;
        submitSimulatedTurn();
      });
    });
  }

  // Check backend health and status
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        telephonyStatusPill.classList.add('online');
        telephonyStatusText.textContent = 'Service Connected';
      } else {
        telephonyStatusText.textContent = 'Degraded Connection';
      }
    } catch {
      telephonyStatusText.textContent = 'Backend Offline';
    }
  }

  // Fetch all customers from backend
  async function fetchCustomers() {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        customers = data.data;
        updateStats();
        renderTable(customerSearchInput.value.trim().toLowerCase());
        // If a customer is selected, refresh their data
        if (selectedCustomer) {
          const fresh = customers.find((c) => c.id === selectedCustomer.id);
          if (fresh) selectCustomer(fresh.id, false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  }

  // Update top metric cards
  function updateStats() {
    statTotalCustomers.textContent = customers.length;
    statFailedAutopay.textContent = `${customers.length} Failed`;

    const retries = customers.filter((c) => c.latestOutcome === 'retry_requested').length;
    statRetries.textContent = retries;

    const alt = customers.filter((c) =>
      c.latestOutcome === 'manual_payment' || c.latestOutcome === 'callback_requested'
    ).length;
    statAlternative.textContent = alt;
  }

  // Render customers table
  function renderTable(filterText = '') {
    const filtered = customers.filter((c) => {
      if (!filterText) return true;
      return (
        c.name.toLowerCase().includes(filterText) ||
        c.id.toLowerCase().includes(filterText) ||
        c.phone.toLowerCase().includes(filterText)
      );
    });

    if (filtered.length === 0) {
      customersTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No customer records matching "${filterText}".</td></tr>`;
      return;
    }

    customersTableBody.innerHTML = filtered
      .map((c) => {
        const isSelected = selectedCustomer && selectedCustomer.id === c.id;
        const outcomeBadge = getOutcomeBadge(c.latestOutcome);
        const formattedAmount = `₹${c.amountDue.toLocaleString('en-IN')}`;

        return `
        <tr class="${isSelected ? 'active-row' : ''}" data-id="${c.id}">
          <td>
            <div class="customer-name">${escapeHtml(c.name)}</div>
            <div class="customer-id">${c.id}</div>
          </td>
          <td class="font-mono">${c.phone}</td>
          <td class="font-semibold">${formattedAmount}</td>
          <td>${c.dueDate}</td>
          <td><span class="badge badge-failed">${c.autopayStatus}</span></td>
          <td>${outcomeBadge}</td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary btn-table-call" data-id="${c.id}">
              Call
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    // Attach row click listeners
    customersTableBody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', (e) => {
        const id = row.getAttribute('data-id');
        if (id) selectCustomer(id);
      });
    });

    // Attach table action button click listeners
    customersTableBody.querySelectorAll('.btn-table-call').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) {
          selectCustomer(id);
          initiateCall(id);
        }
      });
    });
  }

  // Select a customer
  function selectCustomer(id, shouldLoadCalls = true) {
    const cust = customers.find((c) => c.id === id);
    if (!cust) return;

    selectedCustomer = cust;
    activeCallSid = cust.latestCallSid || null;

    noCustomerSelected.classList.add('hidden');
    customerSelectedContent.classList.remove('hidden');

    selectedCustomerTitle.textContent = cust.name;
    selectedCustomerSubtitle.textContent = `ID: ${cust.id} · Due: ${cust.dueDate}`;
    selectedCustomerBadge.className = `badge ${cust.latestOutcome ? 'badge-retry' : 'badge-pending'}`;
    selectedCustomerBadge.textContent = cust.latestOutcome ? cust.latestOutcome.replace('_', ' ') : 'Pending Outreach';

    custDetailId.textContent = cust.id;
    custDetailName.textContent = cust.name;
    custDetailPhone.textContent = cust.phone;
    custDetailAmount.textContent = `₹${cust.amountDue.toLocaleString('en-IN')}`;
    custDetailDueDate.textContent = cust.dueDate;
    custDetailOutcome.innerHTML = getOutcomeBadge(cust.latestOutcome);

    renderTable(customerSearchInput.value.trim().toLowerCase());

    if (shouldLoadCalls) {
      loadCustomerCalls(cust.id);
    }
  }

  // Initiate call
  async function initiateCall(customerId) {
    try {
      btnInitiateCall.disabled = true;
      btnInitiateCallText.textContent = 'Calling...';
      callNotice.textContent = 'Contacting telephony gateway...';

      const res = await fetch(`/api/calls/${customerId}`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        activeCallSid = data.callSid;
        callNotice.textContent = data.message || `Call active: ${data.callSid}`;
        await fetchCustomers();
        await loadCustomerCalls(customerId);
      } else {
        alert(`Could not initiate call: ${data.error}`);
        callNotice.textContent = data.error || 'Failed to start call';
      }
    } catch (err) {
      console.error('Call initiation error:', err);
      alert('Error initiating call.');
    } finally {
      btnInitiateCall.disabled = false;
      btnInitiateCallText.textContent = 'Call Customer';
    }
  }

  // Load customer calls & transcript
  async function loadCustomerCalls(customerId) {
    try {
      const res = await fetch(`/api/calls/${customerId}`);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        const latestCall = data.data[0];
        activeCallSid = latestCall.callSid;
        renderTranscript(latestCall.transcript);
        custDetailOutcome.innerHTML = getOutcomeBadge(latestCall.outcome);
      } else {
        renderTranscript([]);
      }
    } catch (err) {
      console.error('Error loading call history:', err);
    }
  }

  // Render transcript feed
  function renderTranscript(transcript) {
    if (!transcript || transcript.length === 0) {
      transcriptCount.textContent = '0 messages';
      transcriptFeed.innerHTML = `
        <div class="text-center text-muted" style="padding: 24px;">
          No conversation recorded yet.<br>Click <strong>Call Customer</strong> to begin.
        </div>
      `;
      return;
    }

    transcriptCount.textContent = `${transcript.length} turns`;
    transcriptFeed.innerHTML = transcript
      .map((entry) => {
        const isAgent = entry.speaker === 'agent';
        const speakerLabel = isAgent ? 'Voice Assistant' : 'Customer';
        const formattedTime = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';

        return `
        <div class="msg-bubble ${isAgent ? 'agent' : 'customer'}">
          <div class="msg-header">
            <span>${speakerLabel}</span>
            <span class="text-dim">${formattedTime}</span>
          </div>
          <div class="msg-body">${escapeHtml(entry.text)}</div>
        </div>
      `;
      })
      .join('');

    // Scroll to bottom
    transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
  }

  // Submit simulated turn
  async function submitSimulatedTurn() {
    const text = simSpeechInput.value.trim();
    if (!text) return;
    if (!selectedCustomer) {
      alert('Please select a customer first');
      return;
    }

    // If no active call, initiate one first
    if (!activeCallSid) {
      await initiateCall(selectedCustomer.id);
    }

    try {
      btnSendSimInput.disabled = true;
      const res = await fetch('/api/calls/simulate-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          callSid: activeCallSid,
          speechResult: text,
        }),
      });

      const data = await res.json();
      if (data.success && data.callRecord) {
        simSpeechInput.value = '';
        renderTranscript(data.callRecord.transcript);
        await fetchCustomers();
      }
    } catch (err) {
      console.error('Simulated turn error:', err);
    } finally {
      btnSendSimInput.disabled = false;
    }
  }

  // Helpers
  function getOutcomeBadge(outcome) {
    if (!outcome || outcome === 'unknown') {
      return '<span class="badge badge-pending">Pending Call</span>';
    }
    switch (outcome) {
      case 'retry_requested':
        return '<span class="badge badge-retry">Retry Requested</span>';
      case 'manual_payment':
        return '<span class="badge badge-manual">Manual Payment</span>';
      case 'callback_requested':
        return '<span class="badge badge-callback">Callback Requested</span>';
      case 'declined':
        return '<span class="badge badge-declined">Declined</span>';
      case 'no_response':
        return '<span class="badge badge-no-response">No Response</span>';
      default:
        return `<span class="badge badge-pending">${escapeHtml(outcome)}</span>`;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Auto-init on page ready
  document.addEventListener('DOMContentLoaded', init);
})();
