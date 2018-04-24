var ThisTokenRocks = artifacts.require("./ThisTokenRocks.sol");

module.exports = function(deployer, network, accounts) {
  // first parameter of constructor is a beneficiary 
  // take the last account out of the list for that
  deployer.deploy(ThisTokenRocks, accounts[0], { gas: 3000000 });
};
