pragma solidity ^0.4.18;


/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
    * @dev The Ownable constructor sets the original `owner` of the contract to the sender
    * account.
    */
    function Ownable() public {
        owner = msg.sender;
    }

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param newOwner The address to transfer ownership to.
    */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
    * @dev Allows the current owner to transfer balance of the contract to his wallet
    */
    function withdraw() external onlyOwner {
        owner.transfer(this.balance);
    }
}

/**
 * @title Chargable
 * @dev The Chargable contract requires
 */
contract Chargable is Ownable {
    int public feeAmount;
    event FeeUpdated(int oldFee, int newFee);

    /**
    * @dev The Ownable constructor sets the original `owner` of the contract to the sender
    * account.
    */
    function Chargable() public {
        feeAmount = 100 szabo; // around 6 US cents as the time of writing
    }

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier withFee() {
        require(int(msg.value) >= feeAmount);
        _;
    }

    /**
    * @dev Allows the current owner to update contract transaction fee
    * @param newFee New Fee amount
    */
    function changeFee(int newFee) public onlyOwner {
        require(newFee > 0);
        FeeUpdated(feeAmount, newFee);
        feeAmount = newFee;
    }
}

/**
 * @title This Token Rocks - smart contract for the map
 * @dev it allows
 *  - owner: to add cities (towers) and get information about them
 *  - player: to joing the game and move.
 *    Move towards a different team is considered an attack which results
 *    in attackers death and getting damage for defender
 *  - if player is located in the city (tower), he can set its title or he can
 */
contract ThisTokenRocks is Chargable {

    // map of our events:
    event CityUpdate(uint32 coord, bytes32 title, uint8 defence);
    event PlayerStart(address indexed player, address token, uint32 indexed coord);
    event PlayerMove(address indexed player, address token, uint32 indexed oldCoord, uint32 indexed newCoord);
    event DefenderDeath(address indexed player, address token, uint32 indexed coord );
    event AttackerDeath(address indexed player, address token, uint32 indexed oldCoord, uint32 indexed newCoord);
    event HealthUpdate(address indexed player, uint32 health);

    // Events that were used for debugging purposes:
    // event PlayerCellRemoved(address player, address coord);
    // event PlayerCellAdded(address player, address coord, uint32 cellIndex, uint32 len);
    // event PlayerCellTrimmed(address coord, uint len);
    // event DefenderDamage(address defender, int cityDefence, int defenderHealth, int damage);

    // list of the players
    struct Player {
        // team of the player - which coin this player has joined
        address coin;
        // XY coordinates of the player
        uint32 coord;
        // Stamina/Health of the player that is left
        uint32 health;
        // index in players array on particular cell
        uint32 cellIndex;
    }
    mapping(address => Player) public players;

    // list of the cities. City is the cell that
    struct City {
        // Coordinate (same as in the key of the mapping)
        uint32 coord;
        // Index in array of citiesIndex
        uint index;
        // Title of the city (could be purchased by player inside)
        bytes32 title;
        // Defence Ratio of the city (could be purchased by player inside)
        uint8 defence;
    }
    mapping(uint32 => City) public cities;
    uint32[] private citiesIndex;

    // list of occupied game cells. Each cell descriptor contains list of players
    struct Cell {
        // Coin that is place at that cell
        address coin;
        // in perfect world without solidity restrictions - that could be and array
        address[] players;
        // real(!) number of players at that cell
        // we cannot trust players.length as some of the items are remaining empty
        uint num;
    }
    mapping(uint32 => Cell) public cells;

    function ThisTokenRocks() public {
    }

    // initialize cell
    function _initCell(uint32 _coord, address _team) private {
        cells[_coord] = Cell({
            coin: _team,
            players: new address[](0),
            num: 0
        }); // no coin, no folks on the start
    }

    // add player to the cell - only we know for sure
    // that we can do that
    function _removeCellPlayer(uint32 _coord, address _player) private {
         // integrity check - player coordinate should match
        require(players[_player].coord == _coord);
         // integrity check - player should be present in the list in the proper place
        require(cells[_coord].players[players[_player].cellIndex] == _player);

        cells[_coord].players[players[_player].cellIndex] = address(0x0);

        // now we should trim the last elements if they are zero addresses
        uint len = cells[_coord].players.length;
        while (len >= 1) {
            if (cells[_coord].players[len - 1] == address(0x0)) {
                delete cells[_coord].players[len - 1];
                cells[_coord].players.length --;
                // PlayerCellTrimmed(_coord, cells[_coord].players.length);
            } else {
                break;
            }
            len--;
        }
        // and check - if the last player has left the cell,
        // it should reset the team counter - cell becomes available
        if (len == 0) {
            cells[_coord].coin = 0x0;
        }

        players[_player].cellIndex = 0; // not necessary
        cells[_coord].num --;
        // PlayerCellRemoved(_player, _coord);
    }

    // add player to the cell - only we know for sure
    // that we can do that - cell must be initialized
    // and match players team
    function _addCellPlayer(uint32 _coord, address _player) private {
        uint32 len = uint32(cells[_coord].players.length);
        if (len == 0) {
            cells[_coord].coin = players[_player].coin;
        }
        cells[_coord].players.push(_player);
        cells[_coord].num ++;
        players[_player].coord = _coord;
        players[_player].cellIndex = len;
        // PlayerCellAdded(_player, _coord, len, uint32(cells[_coord].players.length));
    }

    function getCellPlayers(uint32 _coord) view public returns(address[]) {
        return cells[_coord].players;
    }

    /**
     * Admin only: adding single city to the map
     */
    function _addCity(uint32 _coord) private {
        _initCell(_coord, address(0x0));
        cities[_coord] = City({
            coord: _coord,
            index: citiesIndex.length,
            title: 0x0,
            defence: 1 // every city has a defence of 1 by default
        });
        citiesIndex.push(_coord);
        CityUpdate(_coord, 0x0, 1);
    }
    /**
     * Admin only: adding multiple cities to the map.
     * Adding it one by one requres too much gas
     */
    function addCities(uint32[] _coords) onlyOwner public {
        for (uint i = 0; i < _coords.length; i++) {
            _addCity(_coords[i]);
        }
    }
    /**
     * Getting how many cities do we have
     */
    function getCitiesCount() public constant returns(uint count) {
        return citiesIndex.length;
    }
    /**
     * Getting coordinates of the city at certain index
     */
    function getCityCoordAtIndex(uint index) public constant returns(uint32) {
        return citiesIndex[index];
    }

    function _requireCity(uint32 coord) view private {
        // on start up, cities defence is 1, so comparison to zero
        // can be a check for presence
        require(cities[coord].defence > 0);
    }

    // require that player has already joined
    // returns coordinates of where the player is located
    function _requirePlayer(address p) view private returns (uint32) {
        require(p != address(0x0));
        require(players[p].coin != address(0x0));
        return players[p].coord;
    }

    // Buying Name / Label for the city where you are located
    function setTitle(bytes32 _title) payable withFee public {
        // getting coordinates of the current player
        uint32 coord = _requirePlayer(msg.sender);
        // ensure these are coordinates of a real city
        _requireCity(coord);
        // setting city label/title
        cities[coord].title = _title;
        CityUpdate(coord, cities[coord].title, cities[coord].defence);
    }

    // adding defence for the city
    function addDefence() payable withFee public {
        // getting coordinates of the current player
        uint32 coord = _requirePlayer(msg.sender);
        // ensure these are coordinates of a real city
        _requireCity(coord);
        // the defence cannot exceed 8
        uint8 defence = cities[coord].defence;
        require(defence < 8);
        // city players must qualify for upgrade: there should be min amount of people on that cell
        // before level upgrade
        // - - - - - - commented out for beta-testing - - - - - - //
        uint num = cells[coord].num;
        if (defence == 2) { 
            require(num >= 10); 
        } else if (defence == 3) { 
            require(num >= 50); 
        } else if (defence == 4) { 
            require(num >= 100); 
        } else if (defence == 5) { 
            require(num >= 250); 
        } else if (defence == 6) { 
            require(num >= 1000); 
        } else if (defence == 7) {
            require(num >= 2500); 
        }
        // increase defence
        cities[coord].defence = defence + 1;
        CityUpdate(coord, cities[coord].title, cities[coord].defence);
    }

    // start: join the game under certain coin/team
    // jump into certain coordinates
    function start(address _team, uint32 _coord) payable withFee public {
        // require totally new player
        require(msg.sender != address(0x0));
        require(players[msg.sender].coin == address(0x0)); // check for duplicate key
        // require empty cell or same team
        if (cells[_coord].coin == address(0x0)) {
            _initCell(_coord, _team);
        } else {
            require(cells[_coord].coin == _team);
        }
        // register new player
        players[msg.sender] = Player(_team, _coord, 100, 0);
        _addCellPlayer(_coord, msg.sender);
        PlayerStart(msg.sender, _team, _coord);
    }

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // methods below are not tested much... must have better unit test coverage
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    function _requireDefender(uint32 _coord) view private returns (address) {
        uint len = cells[_coord].players.length;
        return cells[_coord].players[len - 1];
    }

    function _attack(address _attacker, uint32 _coord) private { //  _attacker newCoord
        // who is under attack? define the player that will be hit
        address defender = _requireDefender(_coord);
        address attackerTeam = players[_attacker].coin;
        address defenderTeam = players[defender].coin;
        int defenderHealth = int(players[defender].health);
        int cityDefence = int(cities[_coord].defence); // 0 (no city) 1 (x2) 8 (x8)

        // attacker always dies (first)
        uint32 oldCoord = players[_attacker].coord;
        players[_attacker].health = 0;
        players[_attacker].coin = address(0x0);
        _removeCellPlayer(oldCoord, _attacker);
        AttackerDeath(_attacker, attackerTeam, oldCoord, _coord);

        // attack on plain surface takes 60 health of defender.
        // defender dies on the second attack (together with attacker who always dies)
        int damage = 60 / ( 1 + cityDefence );
        // DefenderDamage(defender, cityDefence, defenderHealth, damage);

        // define whether defender died
        if (damage >= defenderHealth) {
            _removeCellPlayer(_coord, defender);
            players[defender].health = 0;
            players[defender].coin = address(0x0);
            DefenderDeath(defender, defenderTeam, _coord);
        } else {
            // if defender is alive, but his health is decreased
            players[defender].health = uint32(defenderHealth - damage);
            HealthUpdate(defender, players[defender].health);
        }
    }

    // check that this is a valid move between adjacent cells
    function _requireValidMove(uint32 _from, uint32 _to) pure private {
        uint32 fromX = _from & 0xFFFF;
        uint32 fromY = _from >> 16;
        uint32 toX = _to & 0xFFFF;
        uint32 toY = _to >> 16;
        // do not allow to stay on same cell
        require(fromX != toX || fromY != toY);
        // require that the cell is adjacent
        // (coordinates are a bit tricky, there is a difference between even and odd map rows)
        if ((fromY % 2) == 0) {
            require((toX == (fromX-1) && toY == (fromY-1)) || (toX == (fromX-1) && toY == (fromY+1)) || (toX == fromX && toY == (fromY-1)) || (toX == fromX && toY == (fromY+1)));
        } else {
            require((toX == fromX && toY == (fromY-1)) || (toX == fromX && toY == (fromY+1)) || (toX == (fromX+1) && toY == (fromY-1)) || (toX == (fromX+1) && toY == (fromY+1)));
        }
    }

    // move to another cell
    // in case of another team presence it is considered to be an "attack"
    function move(uint32 _newCoord) payable withFee public {
        uint32 oldCoord = _requirePlayer(msg.sender);
        _requireValidMove(oldCoord, _newCoord); // check that this move is possible
        address team = cells[_newCoord].coin;
        address playerTeam = players[msg.sender].coin;
        bool isOccupied = (team != address(0x0));
        if (isOccupied) {
            bool hasEnemy = (team != playerTeam);
            if (hasEnemy) {
                _attack(msg.sender, _newCoord);
            } else {
                _removeCellPlayer(oldCoord, msg.sender);
                _addCellPlayer(_newCoord, msg.sender);
                PlayerMove(msg.sender, playerTeam, oldCoord, _newCoord);
            }
        } else {
            _removeCellPlayer(oldCoord, msg.sender);
            _initCell(_newCoord, playerTeam);
            _addCellPlayer(_newCoord, msg.sender);
            PlayerMove(msg.sender, playerTeam, oldCoord, _newCoord);
        }
    }

}
