// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CrowdChain - Milestone-Based Decentralized Crowdfunding
 * @notice Enforces verifiable milestone release approvals and automated backer refund protections.
 */
contract CrowdChain {
    enum CampaignState { ACTIVE, SUCCESSFUL, FAILED, COMPLETED }

    struct Milestone {
        string description;
        uint256 allocationAmount;
        uint256 approvalsCount;
        bool released;
        mapping(address => bool) voted;
    }

    struct Campaign {
        uint256 id;
        address payable creator;
        string title;
        string metadataUri;
        uint256 fundingGoal;
        uint256 deadline;
        uint256 totalPledged;
        uint256 fundsClaimed;
        CampaignState state;
        uint256 milestoneCount;
    }

    uint256 public campaignCounter;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => uint256)) public pledges;
    mapping(uint256 => mapping(uint256 => Milestone)) public campaignMilestones;
    mapping(uint256 => address[]) private campaignBackers;

    event CampaignCreated(uint256 indexed id, address indexed creator, uint256 goal, uint256 deadline);
    event Pledged(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event RefundClaimed(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event MilestoneProposed(uint256 indexed campaignId, uint256 indexed milestoneId, uint256 amount);
    event MilestoneVoted(uint256 indexed campaignId, uint256 indexed milestoneId, address indexed voter);
    event MilestoneReleased(uint256 indexed campaignId, uint256 indexed milestoneId, uint256 amount);

    modifier onlyCreator(uint256 _campaignId) {
        require(msg.sender == campaigns[_campaignId].creator, "Only campaign creator can call this");
        _;
    }

    function createCampaign(
        string memory _title,
        string memory _metadataUri,
        uint256 _fundingGoal,
        uint256 _durationSeconds
    ) external returns (uint256) {
        require(_fundingGoal > 0, "Goal must be positive");
        require(_durationSeconds >= 1 hours, "Duration too short");

        campaignCounter++;
        uint256 newId = campaignCounter;

        campaigns[newId] = Campaign({
            id: newId,
            creator: payable(msg.sender),
            title: _title,
            metadataUri: _metadataUri,
            fundingGoal: _fundingGoal,
            deadline: block.timestamp + _durationSeconds,
            totalPledged: 0,
            fundsClaimed: 0,
            state: CampaignState.ACTIVE,
            milestoneCount: 0
        });

        emit CampaignCreated(newId, msg.sender, _fundingGoal, block.timestamp + _durationSeconds);
        return newId;
    }

    function pledge(uint256 _campaignId) external payable {
        Campaign storage camp = campaigns[_campaignId];
        require(camp.state == CampaignState.ACTIVE, "Campaign is not active");
        require(block.timestamp < camp.deadline, "Campaign funding window expired");
        require(msg.value > 0, "Pledge amount must be greater than zero");

        if (pledges[_campaignId][msg.sender] == 0) {
            campaignBackers[_campaignId].push(msg.sender);
        }

        pledges[_campaignId][msg.sender] += msg.value;
        camp.totalPledged += msg.value;

        if (camp.totalPledged >= camp.fundingGoal) {
            camp.state = CampaignState.SUCCESSFUL;
        }

        emit Pledged(_campaignId, msg.sender, msg.value);
    }

    function claimRefund(uint256 _campaignId) external {
        Campaign storage camp = campaigns[_campaignId];
        require(block.timestamp >= camp.deadline, "Funding window still open");
        require(camp.totalPledged < camp.fundingGoal, "Campaign reached goal, non-refundable");
        require(pledges[_campaignId][msg.sender] > 0, "No pledge to refund");

        camp.state = CampaignState.FAILED;
        uint256 amountToRefund = pledges[_campaignId][msg.sender];
        pledges[_campaignId][msg.sender] = 0;

        (bool sent, ) = payable(msg.sender).call{value: amountToRefund}("");
        require(sent, "Refund transfer failed");

        emit RefundClaimed(_campaignId, msg.sender, amountToRefund);
    }

    function addMilestone(
        uint256 _campaignId,
        string memory _description,
        uint256 _allocationAmount
    ) external onlyCreator(_campaignId) {
        Campaign storage camp = campaigns[_campaignId];
        require(camp.fundsClaimed + _allocationAmount <= camp.totalPledged, "Allocation exceeds available funds");

        uint256 mId = camp.milestoneCount;
        Milestone storage m = campaignMilestones[_campaignId][mId];
        m.description = _description;
        m.allocationAmount = _allocationAmount;
        m.approvalsCount = 0;
        m.released = false;

        camp.milestoneCount++;
        emit MilestoneProposed(_campaignId, mId, _allocationAmount);
    }

    function voteMilestone(uint256 _campaignId, uint256 _milestoneId) external {
        require(pledges[_campaignId][msg.sender] > 0, "Must be a backer to vote");
        Milestone storage m = campaignMilestones[_campaignId][_milestoneId];
        require(!m.released, "Milestone already released");
        require(!m.voted[msg.sender], "Already voted on this milestone");

        m.voted[msg.sender] = true;
        m.approvalsCount++;

        emit MilestoneVoted(_campaignId, _milestoneId, msg.sender);
    }

    function releaseMilestoneFunds(uint256 _campaignId, uint256 _milestoneId) external onlyCreator(_campaignId) {
        Campaign storage camp = campaigns[_campaignId];
        Milestone storage m = campaignMilestones[_campaignId][_milestoneId];
        require(!m.released, "Already released");

        // Quorum: requires > 50% of backers approval
        uint256 totalBackers = campaignBackers[_campaignId].length;
        require(m.approvalsCount * 2 > totalBackers, "Quorum not reached (>50% required)");

        m.released = true;
        camp.fundsClaimed += m.allocationAmount;

        (bool sent, ) = camp.creator.call{value: m.allocationAmount}("");
        require(sent, "Milestone payout failed");

        if (camp.fundsClaimed >= camp.totalPledged) {
            camp.state = CampaignState.COMPLETED;
        }

        emit MilestoneReleased(_campaignId, _milestoneId, m.allocationAmount);
    }
}
