import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const dbPath = process.env.CROWDCHAIN_DB || join(DATA_DIR, 'crowdchain.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY,
      creator TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      funding_goal REAL NOT NULL,
      total_pledged REAL NOT NULL DEFAULT 0,
      funds_claimed REAL NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('ACTIVE', 'SUCCESSFUL', 'FAILED', 'COMPLETED')),
      deadline TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pledges (
      id TEXT PRIMARY KEY,
      campaign_id INTEGER NOT NULL,
      backer TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_hash TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      campaign_id INTEGER NOT NULL,
      milestone_index INTEGER NOT NULL,
      description TEXT NOT NULL,
      allocation_amount REAL NOT NULL,
      approvals_count INTEGER NOT NULL DEFAULT 0,
      released INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS milestone_votes (
      milestone_id TEXT NOT NULL,
      backer TEXT NOT NULL,
      PRIMARY KEY (milestone_id, backer)
    );
  `);

  const countRow = db.prepare('SELECT COUNT(*) as c FROM campaigns;').get();
  if (countRow.c === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const seedCampaigns = [
    {
      id: 1,
      creator: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
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
      creator: '0x9999888877776666555544443333222211110000',
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
      creator: '0x4444555566667777888899990000111122223333',
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

  const stmt = db.prepare(`
    INSERT INTO campaigns (id, creator, title, description, category, funding_goal, total_pledged, funds_claimed, state, deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (const c of seedCampaigns) {
    stmt.run(c.id, c.creator, c.title, c.description, c.category, c.funding_goal, c.total_pledged, c.funds_claimed, c.state, c.deadline);
  }

  // Seed milestones for campaign 1
  const mStmt = db.prepare(`
    INSERT INTO milestones (id, campaign_id, milestone_index, description, allocation_amount, approvals_count, released, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  mStmt.run('m-1-0', 1, 0, 'PCB Schematic Finalization & Initial Fab Test', 10.0, 12, 1, '0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd');
  mStmt.run('m-1-1', 1, 1, 'Firmware Mesh Protocol & Battery Efficiency Testing', 10.0, 8, 0, null);
  mStmt.run('m-1-2', 1, 2, 'Batch Manufacturing & Global Field Deployment', 8.5, 2, 0, null);

  // Seed sample pledges
  const pStmt = db.prepare(`
    INSERT INTO pledges (id, campaign_id, backer, amount, tx_hash)
    VALUES (?, ?, ?, ?, ?);
  `);
  pStmt.run('p-1', 1, '0x2222222222222222222222222222222222222222', 15.0, '0x1111111111111111111111111111111111111111111111111111111111111111');
  pStmt.run('p-2', 1, '0x3333333333333333333333333333333333333333', 13.5, '0x2222222222222222222222222222222222222222222222222222222222222222');
  pStmt.run('p-3', 2, '0x5555555555555555555555555555555555555555', 6.2, '0x3333333333333333333333333333333333333333333333333333333333333333');
}

initDb();
