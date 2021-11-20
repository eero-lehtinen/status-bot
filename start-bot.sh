#!/bin/sh

GAME_NAME=$(grep -oP '(?<=game = \")(.*)(?=\")' ./config.toml)
NODE_PATH=$(which node)

echo "Starting bot"
echo "Detected game name: ${GAME_NAME}"
echo "Detected node path: ${NODE_PATH}"

pm2 start ./out/index.js --name "${GAME_NAME}-server-status" \
	--watch ./out --restart-delay 3000 --time \
	--interpreter="${NODE_PATH}" \
	--node-args="-r dotenv-safe/config"