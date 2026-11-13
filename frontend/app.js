// CrowdChain Decentralized Crowdfunding Client
const API_BASE = window.location.origin.includes('http') && !window.location.origin.startsWith('file:')
  ? window.location.origin
  : 'http://localhost:4023';

let currentCampaigns = [];
let activeFilter = 'ALL';
let simulatedUserWallet = '0x2222222222222222222222222222222222222222';

document.addEventListener('DOMContentLoaded', () => {
  setupFilterTabs();
  setupSearch();
  setupModals();
  loadStats();
  loadCampaigns();
});

function setupFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.status;
      renderCampaigns();
    });
  });
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderCampaigns(e.target.value.toLowerCase());
  });
}

function setupModals() {
  const createModal = document.getElementById('createModal');
  const detailModal = document.getElementById('detailModal');

  document.getElementById('openCreateModal').addEventListener('click', () => {
    createModal.classList.add('active');
  });

  document.getElementById('closeCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });
  document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });

  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    detailModal.classList.remove('active');
  });

  document.getElementById('createCampaignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      creator: simulatedUserWallet,
      title: document.getElementById('cmpTitle').value.trim(),
      category: document.getElementById('cmpCategory').value,
      fundingGoal: parseFloat(document.getElementById('cmpGoal').value),
      durationDays: parseInt(document.getElementById('cmpDuration').value, 10),
      description: document.getElementById('cmpDesc').value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to deploy campaign');
        return;
      }
      createModal.classList.remove('active');
      document.getElementById('createCampaignForm').reset();
      loadCampaigns();
      loadStats();
    } catch (err) {
      alert('Network error connecting to CrowdChain node: ' + err.message);
    }
  });
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    if (!res.ok) throw new Error('Stats status ' + res.status);
    const data = await res.json();
    document.getElementById('totalVolume').textContent = `${data.totalVolumeEth.toFixed(2)} ETH`;
    document.getElementById('disbursedVolume').textContent = `${data.disbursedVolumeEth.toFixed(2)} ETH`;
  } catch (err) {
    // Keep defaults
  }
}

async function loadCampaigns() {
  try {
    const res = await fetch(`${API_BASE}/api/campaigns`);
    if (!res.ok) throw new Error('Campaigns status ' + res.status);
    const data = await res.json();
    currentCampaigns = data.campaigns || [];
    renderCampaigns();
  } catch (err) {
    // Standalone fallback
    currentCampaigns = [
      {
        id: 1,
        title: 'Decentralized Sovereign Mesh Network Hardware',
        description: 'Open-source solar powered LoRa mesh routers for emergency disaster telecommunications.',
        category: 'Hardware & IoT',
        funding_goal: 25.0,
        total_pledged: 28.5,
        funds_claimed: 10.0,
        state: 'SUCCESSFUL',
        deadline: new Date(Date.now() + 86400000 * 14).toISOString()
      },
      {
        id: 2,
        title: 'Zero-Knowledge Credential Issuer SDK',
        description: 'Privacy-first verifiable credentials SDK leveraging Groth16 zero-knowledge proofs on EVM.',
        category: 'Cryptography & Web3',
        funding_goal: 15.0,
        total_pledged: 6.2,
        funds_claimed: 0.0,
        state: 'ACTIVE',
        deadline: new Date(Date.now() + 86400000 * 7).toISOString()
      },
      {
        id: 3,
        title: 'Quantum-Resistant Ledger Archival Protocol',
        description: 'State preservation layer securing historical blockchain receipts against Shor algorithm attacks.',
        category: 'Infrastructure',
        funding_goal: 40.0,
        total_pledged: 12.0,
        funds_claimed: 0.0,
        state: 'FAILED',
        deadline: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ];
    renderCampaigns();
  }
}

function renderCampaigns(query = '') {
  const grid = document.getElementById('campaignsGrid');
  let filtered = currentCampaigns;

  if (activeFilter !== 'ALL') {
    filtered = filtered.filter(c => c.state === activeFilter);
  }

  if (query) {
    filtered = filtered.filter(c => c.title.toLowerCase().includes(query) || c.description.toLowerCase().includes(query));
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="loading-state">No campaigns found matching current criteria.</div>';
    return;
  }

  grid.innerHTML = filtered.map(c => {
    const percent = Math.min(100, Math.round((c.total_pledged / c.funding_goal) * 100));
    const deadlineDate = new Date(c.deadline).toLocaleDateString();
    const statusClass = `status-${c.state.toLowerCase()}`;

    return `
      <div class="campaign-card" onclick="openCampaignDetail(${c.id})">
        <div class="card-top">
          <span class="category-badge">${escapeHtml(c.category || 'Web3')}</span>
          <span class="status-badge ${statusClass}">${escapeHtml(c.state)}</span>
        </div>
        <h3 class="campaign-title">${escapeHtml(c.title)}</h3>
        <p class="campaign-desc">${escapeHtml(c.description)}</p>

        <div class="progress-section">
          <div class="progress-header">
            <span class="font-bold">${c.total_pledged.toFixed(1)} ETH raised</span>
            <span>${percent}% of ${c.funding_goal.toFixed(1)} ETH</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>

        <div class="card-footer">
          <span>Deadline: ${deadlineDate}</span>
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openCampaignDetail(${c.id})">View Details &rarr;</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openCampaignDetail = async function(id) {
  const detailModal = document.getElementById('detailModal');
  const content = document.getElementById('detailModalContent');
  const title = document.getElementById('modalCampaignTitle');

  content.innerHTML = '<div class="loading-state">Loading smart contract state and milestone ledger...</div>';
  detailModal.classList.add('active');

  try {
    const res = await fetch(`${API_BASE}/api/campaigns/${id}`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const c = await res.json();
    title.textContent = c.title;

    const percent = Math.min(100, Math.round((c.total_pledged / c.funding_goal) * 100));
    const milestones = c.milestones || [];
    const pledges = c.pledges || [];

    content.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <div style="display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center;">
          <span class="category-badge">${escapeHtml(c.category)}</span>
          <span class="status-badge status-${c.state.toLowerCase()}">${escapeHtml(c.state)}</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">Creator: ${escapeHtml(c.creator.slice(0, 10))}...${escapeHtml(c.creator.slice(-6))}</span>
        </div>
        <p style="font-size: 0.95rem; color: var(--text-muted);">${escapeHtml(c.description)}</p>
      </div>

      <div style="background: var(--bg-surface); padding: 1.25rem; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-family: var(--font-mono); font-size: 0.9rem;">
          <span><strong>${c.total_pledged.toFixed(2)} ETH</strong> pledged</span>
          <span>Goal: <strong>${c.funding_goal.toFixed(2)} ETH</strong> (${percent}%)</span>
        </div>
        <div class="progress-bar-bg" style="height: 10px;">
          <div class="progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
          <span>Backers: <strong>${c.backer_count || pledges.length}</strong></span>
          <span>Disbursed to Creator: <strong>${c.funds_claimed.toFixed(2)} ETH</strong></span>
        </div>
      </div>

      <!-- Action Panel -->
      <div style="display: flex; gap: 1rem; margin-bottom: 1.75rem;">
        ${c.state === 'ACTIVE' ? `
          <button class="btn btn-primary" onclick="pledgePrompt(${c.id})">💰 Pledge ETH</button>
        ` : ''}
        ${c.state === 'FAILED' ? `
          <button class="btn btn-secondary" style="border-color: var(--accent-red); color: var(--accent-red);" onclick="claimRefundAction(${c.id})">↩️ Claim Backer Refund</button>
        ` : ''}
      </div>

      <!-- Milestones Governance -->
      <h4 style="margin-bottom: 1rem; font-size: 1.05rem;">Project Milestones & Governance Approvals</h4>
      ${milestones.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.88rem;">No milestones defined for this campaign yet.</p>' : milestones.map(m => `
        <div class="milestone-item">
          <div class="milestone-top">
            <strong>${escapeHtml(m.description)}</strong>
            <span style="font-family: var(--font-mono); color: var(--primary); font-weight: 700;">${m.allocation_amount.toFixed(1)} ETH</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--text-muted); margin-top: 0.5rem;">
            <span>Approvals: <strong>${m.approvals_count}</strong></span>
            <span>Status: <strong>${m.released ? '✅ Funds Released' : '⏳ In Review / Voting'}</strong></span>
            ${!m.released ? `
              <button class="btn btn-secondary btn-sm" onclick="voteMilestoneAction('${escapeHtml(m.id)}', ${c.id})">Vote Approve</button>
            ` : ''}
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    content.innerHTML = `<div class="loading-state" style="color: var(--accent-red);">Failed to fetch campaign details: ${err.message}</div>`;
  }
};

window.pledgePrompt = async function(campaignId) {
  const amountStr = prompt('Enter pledge amount in ETH:', '1.0');
  if (!amountStr) return;
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    alert('Invalid amount');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/campaigns/${campaignId}/pledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backer: simulatedUserWallet, amount })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Pledge failed');
      return;
    }
    alert(`Pledge of ${amount} ETH confirmed! Transaction broadcast to EVM.`);
    openCampaignDetail(campaignId);
    loadCampaigns();
    loadStats();
  } catch (err) {
    alert('Error submitting pledge: ' + err.message);
  }
};

window.voteMilestoneAction = async function(milestoneId, campaignId) {
  try {
    const res = await fetch(`${API_BASE}/api/milestones/${milestoneId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backer: simulatedUserWallet })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Vote failed');
      return;
    }
    alert('Vote recorded on-chain!');
    openCampaignDetail(campaignId);
  } catch (err) {
    alert('Error voting on milestone: ' + err.message);
  }
};

window.claimRefundAction = async function(campaignId) {
  try {
    const res = await fetch(`${API_BASE}/api/campaigns/${campaignId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backer: simulatedUserWallet })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Refund claim failed');
      return;
    }
    const data = await res.json();
    alert(`Refund of ${data.refundedAmount} ETH disbursed! Tx: ${data.refundTxHash}`);
    openCampaignDetail(campaignId);
    loadCampaigns();
  } catch (err) {
    alert('Error claiming refund: ' + err.message);
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
