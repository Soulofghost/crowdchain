export const config = {
  port: process.env.PORT || 4023,
  env: process.env.NODE_ENV || 'development',
  rpcUrl: process.env.RPC_URL || 'https://ethereum-sepolia.publicnode.com',
  contractAddress: process.env.CONTRACT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
};
