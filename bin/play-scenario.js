/*
 * Watch all the events since map creation (or the latest block saved)
 *  up to latest blocks
 *  contract.events.allEvents({ fromBlock: res.number }, eventHandler)
 *
 - get map from couch and obtain current contract address
 go through all of events of the contract
 - snapshot of cities - updates the map
 - for every block - do the snapshot of player counters.
 */
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const fetch = require('node-fetch');
const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('services/smart_contract/build/contracts/ThisTokenRocks.json')).abi;
const name = process.argv[2] || 'simple8';
const szabo = 1000000000000;
const transactionFee = 100 * szabo;

const Coord = {
  toXY: (coord) => {
    let intval = coord;
    if (typeof coord === 'BigNumber') intval = parseInt(coord.toString(), 10);
    else if (typeof coord === 'string' && coord.substring(0, 2) === '0x') intval = parseInt(coord, 16);
    const x = intval & 0xFFFF;
    const y = intval >> 16;
    return {x, y};
  },
  fromXY: (x, y) => (x + (y << 16))
};

const Log = {
  CityUpdate: ({ coord, title, defence }) => {
    const { x, y } = Coord.toXY(coord);
    console.log('play.event CityUpdate', x + ":" + y, web3.toAscii(title).replace(/\0/g, ''), 'DEFENCE: ', defence.toString());
  },
  PlayerStart: ({ player, token, coord }) => {
    const { x, y } = Coord.toXY(coord);
    console.log("play.event PlayerStart", player, x + ":" + y, "team", token);
  },
  PlayerMove: ({ player, oldCoord, newCoord }) => {
    const old = Coord.toXY(oldCoord);
    const { x, y } = Coord.toXY(newCoord);
    console.log("play.event PlayerMove", player, old.x + ":" + old.y, "->", x + ":" + y);
  },
  DefenderDamage: ({ defender, cityDefence, defenderHealth, damage }) => {
    console.log("play.event DefenderDamage", defender,
      'cityDefence=', cityDefence.toString(),
      'health=', defenderHealth.toString(),
      'damage=', damage.toString());
  },
  HealthUpdate: ({ player, health }) => {
    console.log("play.event HealthUpdate", player, 'health=', health.toString());
  },
  DefenderDeath: ({ player, token, coord }) => {
    const { x, y } = Coord.toXY(coord);
    console.log("play.event DefenderDeath", player, x + ':' + y, 'token=', token);
  },
  AttackerDeath: ({ player, token, oldCoord, newCoord }) => {
    const old = Coord.toXY(oldCoord);
    const { x, y } = Coord.toXY(newCoord);
    console.log("play.event AttackerDeath", player, x + ':' + y, "->", x + ":" + y, 'token=', token);
  },
  PlayerCellAdded: (eventArgs) => {
    const { player, coord, cellIndex, len } = eventArgs;
    const { x, y } = Coord.toXY(coord);
    console.log("play.event", "PlayerCellAdded", player, x + ":" + y,
      'cellIndex=', cellIndex.toString(), 'len=', len.toString());
  },
  PlayerCellRemoved: (eventArgs) => {
    const { player, coord } = eventArgs;
    const { x, y } = Coord.toXY(coord);
    console.log("play.event", "PlayerCellRemoved", player, x + ":" + y);
  },
  PlayerCellTrimmed: (eventArgs) => {
    const { coord, len } = eventArgs;
    const { x, y } = Coord.toXY(coord);
    console.log("play.event", "PlayerCellTrimmed", "len=", len.toString(), x + ":" + y);
  },
  Event: (event) => {
    const eventName = event.event;
    const eventArgs = event.args;
    if (typeof Log[eventName] !== 'function') {
      console.log('UNHANDLED EVENT:', eventName, JSON.stringify(eventArgs));
    } else {
      Log[eventName](eventArgs)
    }
  },
  PlayerDetails: (details) => { // not an event
    const team = details[0];
    const { x, y } = Coord.toXY(details[1]);
    const health = details[2].toString();
    const cellIndex = details[3].toString();
    console.log("play PLAYER DETAILS ", team, "cellIndex=", cellIndex, x + ":" + y, "health=", health);
  },
  CellPlayers: (coord, cell, details) => { // not an event
    const { x, y } = Coord.toXY(coord);
    console.log("play CELL", x + ":" + y, JSON.stringify(cell));
    console.log("play CELL PLAYERS",  x + ":" + y, JSON.stringify(details));
  }
};

const downloadMap = async () => {
  console.log('Downloading map ', name);
  const url = `http://localhost:5984/thistoken/${name}`;
  const responseExisting = await fetch(url);
  if (responseExisting.status !== 200) {
    throw new Error('Map Descriptor Document Was Not Found');
  }
  const jsonExisting = await responseExisting.json();
  // console.log('found map: ', responseExisting.status, JSON.stringify(jsonExisting));
  if (jsonExisting.networkId != web3.version.network) {
    throw new Error('Map Descriptor Document was saved in another network');
  }
  return jsonExisting;
};

const saveBlock = async (doc) => {
  const block = await web3.eth.getBlock(doc.blockNumber);
  console.log('BLOCK', doc.blockNumber, 'TIME', block.timestamp);

  const docId = doc.networkId + '-' + doc.name + '-' + doc.blockNumber;
  const url = `http://localhost:5984/thistoken/${docId}`;
  const responseExisting = await fetch(url);
  const jsonExisting = await responseExisting.json();

  const headers = { 'Content-Type': 'application/json' };
  const payload = { _id: docId, type: 'block', ...doc, timestamp: block.timestamp };
  if (jsonExisting && jsonExisting._rev) { payload._rev = jsonExisting._rev; }

  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) });
  const json = await response.json();
  console.log('Saving block', docId, ': ', response.status, JSON.stringify(json));
};

const getTeam = (index) => {
  const items = [
    "0xa89b5934863447f6e4fc53b315a93e873bda69a3",
    "0x14839bf22810f09fb163af69bd21bd5476f445cd",
    "0x540449e4d172cd9491c76320440cd74933d5691a",
    "0x286bda1413a2df81731d4930ce2f862a35a609fe",
    "0x818fc6c2ec5986bc6e2cbf00939d90556ab12ce5",
    "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d",
    "0xb24754be79281553dc1adc160ddf5cd9b74361a4",
    "0x99ea4db9ee77acd40b119bd1dc4e33e1c070b80d",
    "0x999967e2ec8a74b7c8e9db19e039d920b31d39d0",
    "0x0b1724cc9fda0186911ef6a75949e9c0d3f0f2f3",
    "0x0abdace70d3790235af448c88547603b945604ea",
    "0x17fd666fa0784885fa1afec8ac624d9b7e72b752"
  ];
  return items[index];
};

const actions = [
  { player: 1, action: 'start', team: 0, x: 2, y: 3 },
  { player: 2, action: 'start', team: 1, x: 3, y: 1 },
  { player: 3, action: 'start', team: 1, x: 3, y: 1 },
  { player: 4, action: 'start', team: 1, x: 3, y: 1 },
  //{ player: 5, action: 'start', team: 1, x: 3, y: 1 },

  { player: 2, action: 'move', x: 3, y: 2 },
  { player: 3, action: 'move', x: 3, y: 2 },
  { player: 4, action: 'move', x: 3, y: 2 },

  // 3 attacks, the last is successful
  { player: 2, action: 'move', x: 2, y: 3 },
  { player: 3, action: 'move', x: 2, y: 3 },
  { player: 4, action: 'move', x: 2, y: 3 }
];
// by the end: only player 4 survived and stays on 2:3

downloadMap().then(( { _rev, address, blockNumber, networkId, cities, teams, width, height }) => {
  console.log(_rev, address, blockNumber);

  try {
    // await instance.addDefence.sendTransaction({ from: accounts[q.player], gas: 200000 });
    // console.log('accounts: ', web3.eth.accounts.length);
    (async () => {
      const contract = await web3.eth.contract(abi).at(address);

      const evt = await contract.allEvents({fromBlock: blockNumber}, (error, event) => {
        Log.Event(event);
      });

      for (var i = 0; i < actions.length; i++) {
        const q = actions[i];
        if (!q.action || typeof q.player === 'undefined') continue;
        const from = web3.eth.accounts[q.player];
        const options = {from: from, gas: 250000, value: transactionFee }; // 100 szabo

        try {
          if (q.action == 'start') {
            const team = getTeam(q.team);
            const coord = Coord.fromXY(q.x, q.y);
            console.log('START', 'from:', from, 'team:', team, 'x:', q.x, 'y:', q.y);

            await contract.start.sendTransaction(team, coord, options);
          } else if (q.action === 'move') {
            const coord = Coord.fromXY(q.x, q.y);

            console.log( "=" );

            const playerDetails = await contract.players.call(from);
            Log.PlayerDetails(playerDetails);
            const oldCoord = playerDetails[1];
            Log.CellPlayers( oldCoord, await contract.cells.call(oldCoord), await contract.getCellPlayers.call(oldCoord));
            Log.CellPlayers( coord, await contract.cells.call(coord), await contract.getCellPlayers.call(coord));
            console.log('MOVE', 'player:', from, 'TO x:', q.x, 'y:', q.y);
            const tx = await contract.move.sendTransaction(coord, options);

            Log.CellPlayers( oldCoord, await contract.cells.call(oldCoord), await contract.getCellPlayers.call(oldCoord));
            Log.CellPlayers( coord, await contract.cells.call(coord), await contract.getCellPlayers.call(coord));

            const playerDetailsAfter = await contract.players.call(from);
            Log.PlayerDetails(playerDetailsAfter);
            console.log( "=" );
          }
        } catch (err) {
          console.error('FATAL ERROR: ', err);
          break;
        }
        // console.log(Object.keys(contract[q.action]));
      }

      // evt.stopWatching();
      // process.exit(0);

    })();

  } catch (e) {
    console.error('ERROR:', e);
  }
});

