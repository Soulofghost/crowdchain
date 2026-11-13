import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../src/db.js';
import { crowdChainManager } from '../src/engine/crowdchain.js';

describe('CrowdChain Smart Contract Crowdfunding Engine Tests', () => {
  before(() => {
    initDb();
    // Clean up test campaigns and votes if re-running
    db.exec("DELETE FROM milestone_votes;");
    db.exec("DELETE FROM milestones WHERE campaign_id > 3;");
    db.exec("DELETE FROM pledges WHERE campaign_id > 3 OR backer LIKE '0xtestbacker%';");
    db.exec("DELETE FROM campaigns WHERE id > 3;");
  });

  const creator = '0x1111222233334444555566667777888899990000';
  const backer1 = '0xtestbacker1';
  const backer2 = '0xtestbacker2';

  test('Database seeds initial campaigns with milestones', () => {
    const list = crowdChainManager.listCampaigns();
    assert.ok(list.length >= 3, 'Should have at least 3 initial campaigns');

    const c1 = crowdChainManager.getCampaignDetails(1);
    assert.ok(c1);
    assert.equal(c1.state, 'SUCCESSFUL');
    assert.ok(c1.milestones.length >= 3);
    assert.ok(c1.pledges.length >= 2);
  });

  test('createCampaign initializes new active project', () => {
    const newCamp = crowdChainManager.createCampaign({
      creator,
      title: 'Test Quantum AI Engine',
      description: 'Accelerated tensor processing on neutral atom qubits.',
      category: 'DeepTech',
      fundingGoal: 20.0,
      durationDays: 30
    });

    assert.ok(newCamp.id);
    assert.equal(newCamp.title, 'Test Quantum AI Engine');
    assert.equal(newCamp.total_pledged, 0);
    assert.equal(newCamp.state, 'ACTIVE');
  });

  test('pledge accumulates funds and updates state to SUCCESSFUL when goal met', () => {
    const list = crowdChainManager.listCampaigns();
    const testCamp = list.find(c => c.title === 'Test Quantum AI Engine');
    assert.ok(testCamp);

    // Backer 1 pledges 10 ETH
    const p1 = crowdChainManager.pledge({
      campaignId: testCamp.id,
      backer: backer1,
      amount: 10.0
    });
    assert.equal(p1.totalPledged, 10.0);
    assert.equal(p1.state, 'ACTIVE');

    // Backer 2 pledges 12 ETH (Total: 22 ETH >= Goal 20 ETH)
    const p2 = crowdChainManager.pledge({
      campaignId: testCamp.id,
      backer: backer2,
      amount: 12.0
    });
    assert.equal(p2.totalPledged, 22.0);
    assert.equal(p2.state, 'SUCCESSFUL');
  });

  test('addMilestone, backer voting, and fund release lifecycle', () => {
    const list = crowdChainManager.listCampaigns();
    const testCamp = list.find(c => c.title === 'Test Quantum AI Engine');

    // Add milestone
    const m = crowdChainManager.addMilestone({
      campaignId: testCamp.id,
      description: 'Phase 1 Qubit Entanglement Proof',
      allocationAmount: 8.0
    });
    assert.ok(m.id);
    assert.equal(m.allocation_amount, 8.0);
    assert.equal(m.released, 0);

    // Non-backer cannot vote
    assert.throws(() => {
      crowdChainManager.voteMilestone({
        milestoneId: m.id,
        backer: '0xstranger'
      });
    }, /Only verified backers/);

    // Backer 1 votes
    const v1 = crowdChainManager.voteMilestone({
      milestoneId: m.id,
      backer: backer1
    });
    assert.equal(v1.approvalsCount, 1);

    // Duplicate vote fails
    assert.throws(() => {
      crowdChainManager.voteMilestone({
        milestoneId: m.id,
        backer: backer1
      });
    }, /already voted/);

    // Creator releases milestone funds (quorum met: 1 of 2 backers = 50%)
    const releaseRes = crowdChainManager.releaseMilestone({
      campaignId: testCamp.id,
      milestoneId: m.id,
      creator
    });

    assert.equal(releaseRes.releasedAmount, 8.0);
    assert.ok(releaseRes.txHash.startsWith('0x'));

    const updated = crowdChainManager.getCampaignDetails(testCamp.id);
    assert.equal(updated.funds_claimed, 8.0);
  });

  test('claimRefund returns funds on failed/expired campaigns', () => {
    // Non-existent backer throws
    assert.throws(() => {
      crowdChainManager.claimRefund({
        campaignId: 3,
        backer: '0xnonexistent'
      });
    }, /No refundable pledge found/);

    // Seed a backer pledge for expired campaign 3
    db.prepare(`
      INSERT INTO pledges (id, campaign_id, backer, amount, tx_hash)
      VALUES ('p-test-refund', 3, '0xtestbacker1', 5.0, '0xreftest001');
    `).run();
    db.prepare('UPDATE campaigns SET total_pledged = 17.0 WHERE id = 3;').run();

    const refundRes = crowdChainManager.claimRefund({
      campaignId: 3,
      backer: '0xtestbacker1'
    });

    assert.equal(refundRes.refundedAmount, 5.0);
    assert.ok(refundRes.refundTxHash.startsWith('0x'));

    const camp3 = crowdChainManager.getCampaignDetails(3);
    assert.equal(camp3.state, 'FAILED');
  });
});
