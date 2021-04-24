const ms = require("ms")
const fetch = require("node-fetch")
const Discord = require("discord.js")
const fs = require("fs")
const ping = require("ping")

const client = new Discord.Client()
const configFile = "./config.json"
const config = require(configFile)
const debugMode = config.debugMode
const debugLvl = config.debugLvl
const updateInterval = config.updateInterval

const debug = async(debugmessage, debuglvl = 1) => {
	if(debugMode && (debugLvl >= debuglvl)) {
		console.log(debugmessage)
	}
}

const updatePresence = async(apiBody) => {
	if(apiBody?.online) {
		const players = apiBody.players.now
		const playersMax = apiBody.players.max
		const playerCount = players + "/" + playersMax
		const statusTitle = (playerCount.length <= 10 ? "Minecraft" : "MC")
		await client.user.setPresence({
			activity: {
				name: statusTitle + " | " + playerCount
			},
			status: "online"
		})
	} 
	else {
		await client.user.setPresence({
			activity: {
				name: "Minecraft | Offline"
			},
			status: "idle"
		})
	}
}

const updateStatus = async() => {
	debug("Updating bot status")
	const apiBody = await fetchMCStatus(undefined, config.serverAddress, config.serverPort)
	await updatePresence(apiBody)
	if(config.pinUpdate) {
		await updatePin(apiBody)
	}
	debug(`Minecraft server online: ${apiBody.online}`, 1)
}

const updatePin = async(apiBody) => {
	try {
		const guild = client.guilds.cache.get(config.pinGuildId)
		if(!guild) {
			debug(`Unable to find guild. Most likely you haven't set a pin. Use ${config.prefix}pin to set one. Or set updatePin to false in your config.`)
			return
		}
		const channel = guild.channels.cache.find(c => c.id === config.pinChanId && c.type === "text")
		if(!channel) {
			debug(`Unable to find channel. Most likely you haven't set a pin. Use ${config.prefix}pin to set one. Or set updatePin to false in your config.`)
			return
		}

		const message = await channel.messages.fetch(config.pinId)
		if(!message) {
			debug("Unable to find pinned message.")
			return
		}

		await sendStatusEmbed(apiBody, message, true)
		debug("Updated pin.")
	}
	catch(err) {
		console.error("pin update failed", err)
	}
}

const updateConfigFile = async() => {
	fs.writeFile(configFile, JSON.stringify(config, null, 2), function writeJSON(err) {
		if(err) {
			debug(err)
			return
		}
		debug(JSON.stringify(config, null, 2), 2)
		debug("Updating config file: " + configFile)
	})
	delete require.cache[require.resolve("./config.json")]
}

client.on("ready", () => {
	console.log(`Ready. Logged as ${client.user.tag}.`)
	updateStatus()
	setInterval(() => {updateStatus()}, ms(updateInterval))
})

client.on("message", async(message) => {
	if(!message.content.startsWith(config.prefix))
		return

	let args = message.content.replace(config.prefix, "").split(" ")
	let command = args.shift()

	if(command === "help") {
		helpCmd(message)
	}
	if(command === "ip") {
		ipCmd(message)
	}
	if(command === "force-update" || command === "fu") {
		forceUpdateCmd(message)
	}
	if(command === "status" || command === "stat") {
		statusCmd(message)
	}
	if(command === "online" || command === "on") {
		onlineCmd(message)
	}
	if(command === "pin" && config.pinUpdate) {
		pinCmd(message)
	}
	if(command === "set") {
		setCmd(message, args)
	}
	if(command === "supersecretcommandtemplate") {
		secretCmd(message, args)
	}
})

const helpCmd = async(message) => {
	try {
		var commandList = 
		`\`${config.prefix}ip\`\n
		\`${config.prefix}status|stat\`\n
		\`${config.prefix}online|on\`\n
		\`${config.prefix}force-update|fu\`\n
		\`${config.prefix}set <address|port|name|prefix|pinUpdate|showPlayerSample> [value]\`\n
		\`${config.prefix}pin\``
		await message.reply(`bot commands:\n${commandList}`)
	}
	catch(err) {
		console.error("help command failed", err)
	}
}

const ipCmd = async(message) => {
	try {
		await message.reply(`mc server address:\n${config.serverAddress}${config.serverPort ? config.serverPort : ""}`)
	}
	catch (err) {
		console.error("ip command failed", err)
	}
}

const forceUpdateCmd = async(message) => {
	try {
		await message.delete()
		if(!message.member.hasPermission("MANAGE_MESSAGES")) {
			const msg = await message.channel.send("Only server moderators can run this command!")
			await msg.delete({timeout: 3000})
			return
		}
		
		let msg = await message.channel.send("Updating the channels, please wait...")
		await updateStatus()
		msg = msg.edit("Channels were updated successfully!")
		await msg.delete({timeout: 1000})
	}
	catch(err) {
		console.error("force update cmd failed", err)
	}
}

const setConfigValue = async(message, name, key, value) => {
	try {
		let msg = await message.channel.send("Setting " + name)
		config[key] = value
		updateConfigFile()
		msg = await msg.edit(`${name} set to ${config[key]}`)
		msg.delete({timeout: 3000})
	}
	catch(err) {
		console.error("set config value failed", err)
	}
}

const setCmdValidArgs = {
	address: {
		name: "Server address",
		key: "serverAddress",
	},
	port: {
		name: "Port",
		key: "serverPort"
	},
	name: {
		name: "Server name",
		key: "serverName"
	},
	prefix: {
		name: "Command prefix",
		key: "prefix"
	},
	pinupdate: {
		name: "Pin update",
		key: "pinUpdate"
	},
	showplayersample: {
		name: "Show player sample",
		key: "showPlayerSample",
		isBoolean: true
	}
}

const setCmd = async(message, args) => {
	try{
		if(!message.member.hasPermission("MANAGE_MESSAGES")) {
			await message.channel.send("Only server moderators can run this command!")
		}

		const arg = args[0].toLowerCase()

		if (!(arg in setCmdValidArgs)) {
			const msg = await message.channel.send("No arguments set!")
			await msg.delete({timeout: 3000})
			return
		}

		const key = setCmdValidArgs[arg].key
		const name = setCmdValidArgs[arg].name
		let value = args[1]

		if (!value) {
			const msg = await message.channel.send(`No ${name} specified. Current value is: "${config[key]}"`)
			await msg.delete({timeout: 3000})
			return
		}

		if (setCmdValidArgs[arg].isBoolean === true) {
			if (value === "true") value = true
			else if (value === "false") value = false
			else {
				const msg = await message.channel.send("Argument type is wrong (true or false required)")
				await msg.delete({timeout: 3000})
				return
			}
		}

		setConfigValue(message, name, key, value)
	}
	catch (err) {
		console.error("set cmd failed", err)
	}
}


const secretCmd = async (message, args) => {
	let helpPage = args[0] || "1" //take the page from the msg if supplied, otherwise default to page 1
	if(helpPage === "1") {
		await message.channel.send("Super secret commandd template page 1!")
	} else if(helpPage === "2") {
		await message.channel.send("Super secret commandd template page 2!")
	}
}

const sendStatusEmbed = async (apiBody, message, replace) => {
	try {
		let embed = new Discord.MessageEmbed()
			.setAuthor(`${config.serverAddress}:${config.serverPort}`)
			.setColor("#5b8731")
			.setFooter("Minecraft Server Status Bot for Discord")
		
		embed = embed.addFields({
			name: "Motd",
			value: apiBody?.motd || "\u200b"
		}, {
			name: "Version",
			value: apiBody?.server?.name || "\u200b",
			inline: true
		}, {
			name: "Status",
			value: apiBody?.online ? "Online" : "Offline",
			inline: true
		}, {
			name: "Players",
			value: apiBody ? `${apiBody.players.now}/${apiBody.players.max} ${apiBody.players.sample.map(val => val.name).join(", ")}` : "0/0"
		})
			
		if (apiBody?.favicon) {
			const attachment = new Discord.MessageAttachment(Buffer.from(apiBody.favicon.substr("data:image/png;base64,".length), "base64"), "icon.png")
			embed = embed.attachFiles(attachment).setThumbnail("attachment://icon.png")
		}
		
		if (replace)
			return await message.edit(`Status for **${config.serverAddress}:${config.serverPort}**:`, {embed})
		else 
			return await message.channel.send(`Status for **${config.serverAddress}:${config.serverPort}**:`, {embed})
	}
	catch(err) {
		console.error("status embed send failed", err)
	}

}

const pinCmd = async (message) => {
	try {
		const apiBody = await fetchMCStatus(message, config.serverAddress, config.serverPort)
		let msg = await sendStatusEmbed(apiBody, message, false)
		msg = await msg.pin()
		debug("Guild ID set: " + msg.guild.id, 2)
		debug("Channel ID set: " + msg.channel.id, 2)
		debug("Pin message ID set: " + msg.id, 2)
		config.pinGuildId = message.guild.id
		config.pinChanId = message.channel.id
		config.pinId = msg.id
		updateConfigFile()
	}
	catch(err) {
		console.error("pin cmd failed", err)
	}
} 

const onlineCmd = async(message) => {
	try {
		const apiBody = await fetchMCStatus(message, config.serverAddress, config.serverPort)
		if (apiBody) {
			let playersString = ""
			if (config.showPlayerSample) {
				playersString = apiBody.players.sample.map(val => val.name).join(", ")
			}
			await message.channel.send(`Online: ${apiBody.players.now}/${apiBody.players.max} ${playersString}`)
		}
		else {
			await message.channel.send("Offline")
		}
	}
	catch(err) {
		console.error("online cmd failed", err)
	}
}

const fetchMCStatus = async(message, serverAddress, serverPort) => {
	try {
		const pingRes = await ping.promise.probe(serverAddress, {timeout: 5})
		if (!pingRes.alive) {
			return
		}

		const mcRes = await fetch(`https://mcapi.us/server/status?ip=${serverAddress}&port=${serverPort}`)
		if(!mcRes) {
			if (message) {
				await message.delete()
				const msg = await message.channel.send("Looks like mcapi.us is not reachable... Please verify it's online and not being blocked!")
				await msg.delete({timeout: 3000})
			}
			return
		}	

		const body = await mcRes.json()
		if(body.status != "success") {
			if (message) {
				await message.delete()
				const msg = await message.channel.send("Looks like the server is not reachable... Please verify it's online and not blocking access!")
				await msg.delete({timeout: 3000})
			}
			return
		}

		debug(body, 2)
		return body
	}
	catch(err) {
		console.error("mc status fetch failed", err)
	}
}

const statusCmd = async(message) => {
	try {
		const apiBody = await fetchMCStatus(message, config.serverAddress, config.serverPort)
		await sendStatusEmbed(apiBody, message, false)
	}
	catch(err) {
		console.error("status cmd failed", err)
	}
}

client.login(config.token)


