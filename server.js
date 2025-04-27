const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

class Player {
    constructor(name, ws) {
        this.name = name;
        this.ws = ws;
        this.symbol = null;
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

class Lobby {
    constructor(name) {
        this.name = name;
        this.players = [];
        this.board = Array(9).fill(null);
        this.turn = 'X';
        this.started = false;
    }

    addPlayer(player) {
        if (this.players.length >= 2) return false;
        player.symbol = this.players.length === 0 ? 'X' : 'O';
        this.players.push(player);
        player.send({
            type: this.players.length === 1 ? 'lobby_created' : 'lobby_joined',
            symbol: player.symbol,
            lobby: this.name,
            board: this.board,
            turn: this.turn,
            name: player.name
        });

        if (this.players.length === 2) {
            this.broadcast({ type: 'player_joined' });
        }

        return true;
    }

    startGame() {
        this.started = true;
        this.broadcast({ type: 'game_started', board: this.board, turn: this.turn });
    }

    handleMove(player, index) {
        if (!this.started) return;
        if (this.turn !== player.symbol || this.board[index] !== null) return;

        this.board[index] = player.symbol;
        const winner = this.checkWinner();
        const draw = !winner && this.board.every(cell => cell !== null);
        if (winner) {
            this.broadcast({ type: 'game_over', winner: player.symbol, board: this.board });
        } else if (draw) {
            this.broadcast({ type: 'game_over', winner: null, board: this.board });
        } else {
            this.turn = this.turn === 'X' ? 'O' : 'X';
            this.broadcast({
                type: 'move',
                move: { index: index, symbol: player.symbol },
                turn: this.turn
            });
        }
    }

    checkWinner() {
        const combos = [
            [0,1,2],[3,4,5],[6,7,8], // righe
            [0,3,6],[1,4,7],[2,5,8], // colonne
            [0,4,8],[2,4,6]          // diagonali
        ];

        for (let combo of combos) {
            const [a, b, c] = combo;
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return this.board[a];
            }
        }
        return null;
    }

    broadcast(message) {
        this.players.forEach(player => player.send(message));
    }

    removePlayer(player) {
        this.players = this.players.filter(p => p !== player);
        if (this.players.length === 0) {
            delete lobbies[this.name];
        }
    }
}

const lobbies = {};

wss.on('connection', (ws) => {
    let currentPlayer = null;

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);

            switch (data.type) {
                case 'create_lobby':
                    if (!lobbies[data.lobby]) {
                        const lobby = new Lobby(data.lobby);
                        lobbies[data.lobby] = lobby;
                        currentPlayer = new Player(data.name || 'Player', ws);
                        ws.lobby = data.lobby;
                        lobby.addPlayer(currentPlayer);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Lobby già esistente' }));
                    }
                    break;

                case 'join_lobby':
                    const lobbyToJoin = lobbies[data.lobby];
                    if (lobbyToJoin && lobbyToJoin.players.length < 2) {
                        currentPlayer = new Player(data.name || 'Player', ws);
                        ws.lobby = data.lobby;
                        lobbyToJoin.addPlayer(currentPlayer);
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Lobby piena o inesistente' }));
                    }
                    break;

                case 'start_game':
                    if (ws.lobby && lobbies[ws.lobby]) {
                        const lobby = lobbies[ws.lobby];
                        lobby.startGame();
                    }
                    break;

                case 'move':
                    if (ws.lobby && lobbies[ws.lobby]) {
                        const lobby = lobbies[ws.lobby];
                        lobby.handleMove(currentPlayer, data.move.index);
                    }
                    break;
            }
        } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: 'JSON non valido' }));
        }
    });

    ws.on('close', () => {
        if (ws.lobby && lobbies[ws.lobby] && currentPlayer) {
            lobbies[ws.lobby].removePlayer(currentPlayer);
        }
    });
});

console.log('✅ WebSocket server avviato su ws://localhost:8080');
