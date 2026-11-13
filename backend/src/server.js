import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { crowdChainManager } from './engine/crowdchain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(join(__dirname, '../../frontend')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CrowdChain',
    version: '1.0.0',
    network: 'Sepolia Testnet Sync',
    timestamp: new Date().toISOString()
  });
});

// Platform stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = crowdChainManager.getPlatformStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List campaigns
app.get('/api/campaigns', (req, res) => {
  try {
    const status = req.query.status || 'ALL';
    const campaigns = crowdChainManager.listCampaigns(status);
    res.json({ total: campaigns.length, campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Campaign details
app.get('/api/campaigns/:id', (req, res) => {
  try {
    const campaign = crowdChainManager.getCampaignDetails(parseInt(req.params.id, 10));
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create campaign
app.post('/api/campaigns', (req, res) => {
  try {
    const { creator, title, description, category, fundingGoal, durationDays } = req.body;
    const campaign = crowdChainManager.createCampaign({
      creator,
      title,
      description,
      category,
      fundingGoal: parseFloat(fundingGoal),
      durationDays: parseInt(durationDays, 10)
    });
    res.status(201).json(campaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pledge to campaign
app.post('/api/campaigns/:id/pledge', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { backer, amount } = req.body;
    const result = crowdChainManager.pledge({
      campaignId,
      backer,
      amount: parseFloat(amount)
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Claim refund
app.post('/api/campaigns/:id/refund', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { backer } = req.body;
    const result = crowdChainManager.claimRefund({ campaignId, backer });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add milestone
app.post('/api/campaigns/:id/milestones', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const { description, allocationAmount } = req.body;
    const milestone = crowdChainManager.addMilestone({
      campaignId,
      description,
      allocationAmount: parseFloat(allocationAmount)
    });
    res.status(201).json(milestone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Vote on milestone
app.post('/api/milestones/:id/vote', (req, res) => {
  try {
    const milestoneId = req.params.id;
    const { backer } = req.body;
    const result = crowdChainManager.voteMilestone({ milestoneId, backer });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Release milestone funds
app.post('/api/campaigns/:id/milestones/:mId/release', (req, res) => {
  try {
    const campaignId = parseInt(req.params.id, 10);
    const milestoneId = req.params.mId;
    const { creator } = req.body;
    const result = crowdChainManager.releaseMilestone({ campaignId, milestoneId, creator });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`CrowdChain EVM Crowdfunding Gateway running on port ${config.port}`);
  });
}

export default app;
