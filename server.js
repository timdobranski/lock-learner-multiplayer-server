const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors'); // Import cors

const app = express();
const port = process.env.PORT || 3005;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Adjust this to match your client origin
    methods: ["GET", "POST"]
  }
});
let matches = {}; // Store active matches

app.use(cors());
app.use(express.json());

// Serve the main page
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Endpoint to generate a match link
app.post('/create-match', (req, res) => {
  const matchId = uuidv4();
  matches[matchId] = {
    players: [],
    ready: false,
  };
  console.log('new match created. matches array: ', matches);
  res.json({ matchId });
});


// Handle socket connections
io.on('connection', (socket) => {


// Join a match
socket.on('join_match', ({ matchId, username }) => {
  if (matches[matchId]) {
    if (matches[matchId].players.length < 3) {
      const newPlayer = { id: socket.id, username: username, ready: false };
      matches[matchId].players.push(newPlayer);
      socket.join(matchId);

      const match = matches[matchId];

      // If this is the first player, set them as the host
      if (match.players.length === 1) {
        match.host = socket.id;
        console.log(`Host for match ${matchId} is ${socket.id}`);
      }

      // Log the new player's information
      console.log(`New Player Joined... Username: ${newPlayer.username} Socket ID: ${newPlayer.id}`);

      // Broadcast the updated player list to all clients in the match
      // io.to(matchId).emit('player_joined', matches[matchId].players);
      io.to(matchId).emit('player_joined', {
        players: matches[matchId].players,
        host: matches[matchId].host
      });

      if (matches[matchId].players.length === 2) {
        io.to(matchId).emit('match_ready', matchId);
        matches[matchId].ready = true;
      }
    } else {
      socket.emit('match_full', matchId);
    }
  } else {
    socket.emit('match_not_found', matchId);
  }
});

// Update a player's username in the match
socket.on('update_username', ({ matchId, newUsername }) => {
  const match = matches[matchId];
  if (match) {
    const player = match.players.find(player => player.id === socket.id);
    if (player) {
      player.username = newUsername;
      console.log(`Player ${socket.id} updated their username to ${newUsername}`);

      // Broadcast the updated player list to all clients in the match
      io.to(matchId).emit('player_joined', {
        players: matches[matchId].players,
        host: matches[matchId].host
      });

      // Optionally, log the entire matches object for debugging
      console.log('Updated matches object:', JSON.stringify(matches, null, 2));
    }
  }
});


  // Start the game when both players are ready
  socket.on('start_game', (matchId) => {
    if (matches[matchId] && matches[matchId].ready) {
      io.to(matchId).emit('start_game', matchId);
    }
  });

  // Handle progress updates
  socket.on('progress_update', ({ matchId, progress }) => {
    socket.to(matchId).emit('progress_update', {
      playerId: socket.id,
      progress,
    });
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);

    // Clean up the matches
    for (const matchId in matches) {
      const match = matches[matchId];
      match.players = match.players.filter(player => player.id !== socket.id);
      if (match.players.length === 0) {
        delete matches[matchId];
      } else {
      // Check if the disconnected player was the host
      if (match.host === socket.id) {
        // Assign the first player in the remaining players array as the new host
        match.host = match.players[0].id;
        console.log(`New host for match ${matchId} is ${match.host}`);
      }
      console.log('emitting player disconnected...new players array: ', match.players);
        io.to(matchId).emit('player_disconnected', {
          players: matches[matchId].players,
          host: matches[matchId].host
        });
      }
    }
  });

});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
