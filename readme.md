# Game Status Bot for Discord

Shows if a game server is online and how many people are connected to it. Some games also allow you to see the names of the connected players.

## Requirements

- Node.js 16 or higher
- [PM2](https://pm2.keymetrics.io/) (for running multiple bots at once)
  
## Usage
```sh
# Install dependencies
npm install

# Create config.json based on config.example.json

# Run for development
npm run start -- <GAME_NAME>

# Run all games in config.json with PM2
npm run build
pm2 start ecosystem.config.js
```
