import { db } from '../db.js';
import crypto from 'node:crypto';

export class CrowdChainManager {
  listCampaigns(statusFilter = null) {
    if (statusFilter && statusFilter !== 'ALL') {
      return db.prepare('SELECT * FROM campaigns WHERE state = ? ORDER BY id DESC;').all(statusFilter);
    }
    return db.prepare('SELECT * FROM campaigns ORDER BY id DESC;').all();
  }

  getCampaignDetails(id) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?;').get(id);
    if (!campaign) return null;

    const milestones = db.prepare('SELECT * FROM milestones WHERE campaign_id = ? ORDER BY milestone_index ASC;').all(id);
    const pledges = db.prepare('SELECT * FROM pledges WHERE campaign_id = ? ORDER BY timestamp DESC;').all(id);
    const backerCountRow = db.prepare('SELECT COUNT(DISTINCT backer) as count FROM pledges WHERE campaign_id = ?;').get(id);

    return {
      ...campaign,
      backer_count: backerCountRow ? backerCountRow.count : 0,
      milestones,
      pledges
    };
  }

  createCampaign({ creator, title, description, category, fundingGoal, durationDays }) {
    if (!title || !description || fundingGoal <= 0 || durationDays <= 0) {
      throw new Error('Invalid campaign parameters: title, description, goal > 0 and duration > 0 required');
    }

    const deadline = new Date(Date.now() + durationDays * 86400000).toISOString();
    const cleanCreator = (creator || '0x0000000000000000000000000000000000000000').toLowerCase();

    const maxIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nextId FROM campaigns;').get();
    const newId = maxIdRow.nextId;

    db.prepare(`
      INSERT INTO campaigns (id, creator, title, description, category, funding_goal, total_pledged, funds_claimed, state, deadline)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'ACTIVE', ?);
    `).run(newId, cleanCreator, title, description, category || 'General', fundingGoal, deadline);

    return this.getCampaignDetails(newId);
  }

  pledge({ campaignId, backer, amount }) {
    if (amount <= 0) throw new Error('Pledge amount must be greater than zero');
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?;').get(campaignId);
    if (!campaign) throw new Error(`Campaign #${campaignId} not found`);

    if (campaign.state !== 'ACTIVE') {
      throw new Error(`Cannot pledge: Campaign is currently ${campaign.state}`);
    }

    if (new Date(campaign.deadline).getTime() < Date.now()) {
      throw new Error('Funding window for this campaign has expired');
    }

    const cleanBacker = backer.toLowerCase();
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    const pledgeId = 'p-' + crypto.randomBytes(8).toString('hex');

    db.prepare(`
      INSERT INTO pledges (id, campaign_id, backer, amount, tx_hash)
      VALUES (?, ?, ?, ?, ?);
    `).run(pledgeId, campaignId, cleanBacker, amount, txHash);

    const newTotal = campaign.total_pledged + amount;
    const newState = newTotal >= campaign.funding_goal ? 'SUCCESSFUL' : 'ACTIVE';

    db.prepare(`
      UPDATE campaigns SET total_pledged = ?, state = ? WHERE id = ?;
    `).run(newTotal, newState, campaignId);

    return {
      pledgeId,
      txHash,
      campaignId,
      amount,
      totalPledged: newTotal,
      state: newState
    };
  }

  claimRefund({ campaignId, backer }) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?;').get(campaignId);
    if (!campaign) throw new Error(`Campaign #${campaignId} not found`);

    const isPastDeadline = new Date(campaign.deadline).getTime() <= Date.now();
    if (!isPastDeadline && campaign.state !== 'FAILED') {
      throw new Error('Campaign funding window is still open. Refunds only available for expired/failed campaigns.');
    }

    if (campaign.total_pledged >= campaign.funding_goal) {
      throw new Error('Campaign successfully reached funding target; pledges are non-refundable.');
    }

    const cleanBacker = backer.toLowerCase();
    const backerPledges = db.prepare('SELECT SUM(amount) as total FROM pledges WHERE campaign_id = ? AND backer = ?;').get(campaignId, cleanBacker);
    const refundableAmount = backerPledges ? backerPledges.total : 0;

    if (!refundableAmount || refundableAmount <= 0) {
      throw new Error('No refundable pledge found for this backer');
    }

    // Set campaign state to FAILED if not already
    db.prepare("UPDATE campaigns SET state = 'FAILED' WHERE id = ?;").run(campaignId);

    // Delete pledges for this backer and update campaign total
    db.prepare('DELETE FROM pledges WHERE campaign_id = ? AND backer = ?;').run(campaignId, cleanBacker);
    const updatedTotal = Math.max(0, campaign.total_pledged - refundableAmount);
    db.prepare('UPDATE campaigns SET total_pledged = ? WHERE id = ?;').run(updatedTotal, campaignId);

    const refundTxHash = '0x' + crypto.randomBytes(32).toString('hex');
    return {
      campaignId,
      backer: cleanBacker,
      refundedAmount: refundableAmount,
      refundTxHash,
      message: 'Refund disbursed to backer wallet successfully'
    };
  }

  addMilestone({ campaignId, description, allocationAmount }) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?;').get(campaignId);
    if (!campaign) throw new Error(`Campaign #${campaignId} not found`);

    if (allocationAmount <= 0) throw new Error('Allocation amount must be greater than zero');
    if (campaign.funds_claimed + allocationAmount > campaign.total_pledged) {
      throw new Error('Milestone allocation exceeds total pledged funding balance');
    }

    const countRow = db.prepare('SELECT COUNT(*) as c FROM milestones WHERE campaign_id = ?;').get(campaignId);
    const mIndex = countRow.c;
    const mId = `m-${campaignId}-${mIndex}`;

    db.prepare(`
      INSERT INTO milestones (id, campaign_id, milestone_index, description, allocation_amount, approvals_count, released)
      VALUES (?, ?, ?, ?, ?, 0, 0);
    `).run(mId, campaignId, mIndex, description, allocationAmount);

    return db.prepare('SELECT * FROM milestones WHERE id = ?;').get(mId);
  }

  voteMilestone({ milestoneId, backer }) {
    const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?;').get(milestoneId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`);
    if (milestone.released) throw new Error('Milestone funding has already been released');

    const cleanBacker = backer.toLowerCase();
    // Verify backer has backed this campaign
    const pledgeCheck = db.prepare('SELECT COUNT(*) as c FROM pledges WHERE campaign_id = ? AND backer = ?;').get(milestone.campaign_id, cleanBacker);
    if (pledgeCheck.c === 0) {
      throw new Error('Voting rejected: Only verified backers of this campaign may cast approvals');
    }

    // Check duplicate vote
    const voteCheck = db.prepare('SELECT COUNT(*) as c FROM milestone_votes WHERE milestone_id = ? AND backer = ?;').get(milestoneId, cleanBacker);
    if (voteCheck.c > 0) {
      throw new Error('Backer has already voted on this milestone');
    }

    db.prepare('INSERT INTO milestone_votes (milestone_id, backer) VALUES (?, ?);').run(milestoneId, cleanBacker);
    const newApprovals = milestone.approvals_count + 1;
    db.prepare('UPDATE milestones SET approvals_count = ? WHERE id = ?;').run(newApprovals, milestoneId);

    return {
      milestoneId,
      approvalsCount: newApprovals,
      message: 'Vote cast successfully'
    };
  }

  releaseMilestone({ campaignId, milestoneId, creator }) {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?;').get(campaignId);
    if (!campaign) throw new Error(`Campaign #${campaignId} not found`);

    if (campaign.creator.toLowerCase() !== creator.toLowerCase()) {
      throw new Error('Only the campaign creator can trigger milestone fund release');
    }

    const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND campaign_id = ?;').get(milestoneId, campaignId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found for this campaign`);
    if (milestone.released) throw new Error('Funds for this milestone have already been released');

    // Quorum check: require at least 50% approval among distinct backers
    const backerCountRow = db.prepare('SELECT COUNT(DISTINCT backer) as count FROM pledges WHERE campaign_id = ?;').get(campaignId);
    const backerCount = backerCountRow ? backerCountRow.count : 1;
    const requiredQuorum = Math.ceil(backerCount * 0.5);

    if (milestone.approvals_count < requiredQuorum && backerCount > 1) {
      throw new Error(`Quorum not met: required ${requiredQuorum} backer votes, currently has ${milestone.approvals_count}`);
    }

    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE milestones SET released = 1, tx_hash = ? WHERE id = ?;').run(txHash, milestoneId);

    const newClaimed = campaign.funds_claimed + milestone.allocation_amount;
    const newState = newClaimed >= campaign.total_pledged ? 'COMPLETED' : campaign.state;
    db.prepare('UPDATE campaigns SET funds_claimed = ?, state = ? WHERE id = ?;').run(newClaimed, newState, campaignId);

    return {
      milestoneId,
      releasedAmount: milestone.allocation_amount,
      totalClaimed: newClaimed,
      txHash,
      campaignState: newState
    };
  }

  getPlatformStats() {
    const totalCamp = db.prepare('SELECT COUNT(*) as c FROM campaigns;').get().c;
    const fundedCamp = db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE state IN ('SUCCESSFUL', 'COMPLETED');").get().c;
    const totalPledged = db.prepare('SELECT COALESCE(SUM(total_pledged), 0) as s FROM campaigns;').get().s;
    const totalClaimed = db.prepare('SELECT COALESCE(SUM(funds_claimed), 0) as s FROM campaigns;').get().s;

    return {
      totalCampaigns: totalCamp,
      successfulCampaigns: fundedCamp,
      totalVolumeEth: parseFloat(totalPledged.toFixed(2)),
      disbursedVolumeEth: parseFloat(totalClaimed.toFixed(2)),
      contractStatus: 'ONLINE (Sepolia Testnet Sync)'
    };
  }
}

export const crowdChainManager = new CrowdChainManager();
