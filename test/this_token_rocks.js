const ThisTokenRocks = artifacts.require("./ThisTokenRocks.sol");
const fetch = require('node-fetch');
const fs = require('fs');
const ABI = ThisTokenRocks._json.abi;

const theMap = JSON.parse(fs.readFileSync('./maps/latest.json'));
const citiesCoord = theMap.cities;

const szabo = 1000000000000;
const transactionFee = 100 * szabo;

const Promisify = (inner) => (
  new Promise((resolve, reject) => (
    inner((err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    })
  )
));

const saveTheMap = async (networkId, address, blockNumber, cities) => {
  const name = theMap.name;
  const url = `http://localhost:5984/thistoken/${name}`;
  const responseExisting = await fetch(url);
  const jsonExisting = await responseExisting.json();
  console.log('existing map', name, ':', responseExisting.status, JSON.stringify(Object.keys(jsonExisting)));

  const headers = { 'Content-Type': 'application/json' };
  const payload = {
    _id: name, type: 'map', name, networkId, address, blockNumber, cities,
    width: theMap.width, height: theMap.height, teams: {}, abi: ABI
  };
  if (jsonExisting && jsonExisting._rev) { payload._rev = jsonExisting._rev; }
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) });
  const json = await response.json();
  console.log('updating map', name, ': ', response.status, JSON.stringify(json));
};

contract('ThisTokenRocks', (accounts) => {
  let instance;
  let firstBlock = 0;
  let evtHandler = null;
  const cities = {};
  const CityUpdate = ({ coord, title, defence }) => {
    cities[coord] = {
      x: parseInt(coord.toString(), 10) & 0xFFFF,
      y: parseInt(coord.toString(), 10) >> 16,
      coord: coord.toString(),
      title: web3.toAscii(title).replace(/\0/g, ''),
      defence: defence.toString()
    };
  };

  beforeEach(async () => {
    instance = await ThisTokenRocks.deployed();
    // console.log(Object.keys(instance));
    if (!firstBlock) {
      firstBlock = web3.eth.blockNumber;
      console.log('address=', instance.address, 'block=', firstBlock, typeof instance.CityUpdate);

      evtHandler = instance.CityUpdate({
        fromBlock: firstBlock, toBlock: 'latest'
      }, (error, event) => {
        CityUpdate(event.args);
      });
    }
  });

  after(async () => {
    instance = await ThisTokenRocks.deployed();
    evtHandler.stopWatching();
    // console.log('after:', cities);
    await saveTheMap(web3.version.network, instance.address, firstBlock, cities);
  });

  it("should assert true", () => {
    assert.isTrue(true);
  });

  // https://bitbucket.org/rhitchens2/soliditycrud/src/83703dcaf4d0c4b0d6adc0377455c4f257aa29a7/contracts/SolidityCRUD-part1.sol?at=master&fileviewer=file-view-default
  it('should set up cities of Simple8 template and read them', async () => {
    const tx = await instance.addCities.sendTransaction(citiesCoord, {
      from: accounts[0], gas: 4000000
    });
    const receipt = await web3.eth.getTransactionReceipt(tx);

    const val = await instance.cities.call(citiesCoord[2]); // read the second city
    assert.equal(val[0].toString(), citiesCoord[2], "expected to receive coord of saved city");

    const invalid = await instance.cities.call(9999);
    assert.equal(invalid[0].toString(), 0, "expected not to receive city from invalid location");

    const citiesCount = await instance.getCitiesCount.call();
    assert.equal(citiesCount, citiesCoord.length);

    const coord1 = await instance.getCityCoordAtIndex.call(1);
    assert.equal(coord1, citiesCoord[1]);

    if (theMap.queue) {
      // console.log(Object.keys(instance));
      for (let qi = 0; qi < theMap.queue.length; qi++) {
        const q = theMap.queue[qi];
        if (q.action == 'start') {
          const x = q.coord & 0x0FFFF;
          const y = q.coord >> 16;
          console.log('start', 'x=', x, 'y=', y, 'PLAYER', q.player, accounts[q.player], 'TEAM', q.address);
          await instance.start.sendTransaction(q.address, q.coord, {
            from: accounts[q.player], gas: 250000, value: transactionFee
          });
        } else if (q.action == 'upgrade') {
          const x = q.coord & 0x0FFFF;
          const y = q.coord >> 16;
          console.log('addDefence', 'x=', x, 'y=', y, 'PLAYER', q.player, accounts[q.player])
          await instance.addDefence.sendTransaction({
            from: accounts[q.player], gas: 250000, value: transactionFee
          });
        }
      }
    }
  });
});
