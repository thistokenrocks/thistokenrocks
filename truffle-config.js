module.exports = {
  networks: {
    test: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      gas: 1000000 // the upfront cost of contract deployement??
    }
  },
  rpc: {
    host: "localhost",
    port: 8545
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};
