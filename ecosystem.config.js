const fs = require("fs")

const config = JSON.parse(fs.readFileSync("./config.json").toString())
const NODE_PATH = config.nodePath

module.exports = {
	apps: config.gameConfigs.map(obj => ({
		name: `${obj.game}-status-bot`,
		script: "./out/index.js",
		args: obj.game,
		restart_delay: "3000",
		watch: ["out"],
		log_date_format: "YYYY-MM-DD HH:mm Z",
		interpreter: NODE_PATH,
	}))
}