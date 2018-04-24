const fs = require('fs');
console.log(process.argv[2]);
const path = __dirname + '/' + ( process.argv[2] || 'simple8.txt' );
const lineReader = require('readline').createInterface({
  input: fs.createReadStream(path)
});

const Coord = {
  toXY: (coord) => {
    const x = parseInt(coord.toString(), 10) & 0xFFFF;
    const y = parseInt(coord.toString(), 10) >> 16;
    return {x, y};
  },
  fromXY: (x, y) => (x + (y << 16))
};


const basename = (path) => (path.split('/').reverse()[0]);
const _teams = {};
const getRandomTeam = (coord) => {
  if (typeof _teams[coord] !== 'undefined') {
    return _teams[coord];
  }
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
  const team = items[Math.floor(Math.random()*items.length)];
  _teams[coord] = team;
  return team;
};


const cities = [];
const queue = [];
let y = 0;
let width = 0;
let height = 0;
let player = 3;
const validLevels = [1,2,3,4,5,6,7,8];
lineReader.on('line', (line) => {
  for (let x = 0; x < line.length; x++) {
    const validCell = (y % 2) === (x % 2);
    if (!validCell) continue;
    const cityX = (y % 2) ? parseInt((x - 1) / 2, 10): parseInt(x / 2, 10) + 1;
    if (width < cityX) width = cityX;
    const coord = Coord.fromXY(cityX, y);
    const ch = line.charAt(x);
    const num = 1 + parseInt(Math.random() * 3, 10); // random number of people to be on this cell
    if (ch === '-') {
      for (let n = 0; n < num; n++) {
        const address = getRandomTeam(coord);
        queue.push({ action: 'start', address, coord, player });
        player ++;
      }
    } else if (validLevels.indexOf(parseInt(ch, 10)) > -1) {
      const level = parseInt(ch, 10);
      cities.push({ x: cityX, y, coord, level });
      if (level > 1) {
        // we need to put someone there, we cannot have the level
        // pick a random team in a queue of placing at this coordinate
        for (let n = 0; n < num; n++) {
          const address = getRandomTeam(coord);
          queue.push({action: 'start', address, coord, x, y, player});
          if ( n == 0 && level >= 2 ){ // the first player in the city
            for (let i = 2; i <= level; i++) {
              queue.push({action: 'upgrade', coord, x, y, player});
            }
          }
          player++;
        }
      }

    }
  }
  y ++;
  height ++;
});


lineReader.on('close', () => {
  const world = {
    name: basename(path.replace('.txt', '')),
    width, height, queue, cities: cities.map(cty => cty.coord),
  };
  // queue.forEach(q => { console.log(JSON.stringify(q));  });
  console.log(queue.length + ' actions queued');
  fs.writeFileSync(path.replace('.txt', '.json'), JSON.stringify(world));
  fs.writeFileSync('./latest.json', JSON.stringify(world));
});
