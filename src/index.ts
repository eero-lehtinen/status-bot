import ms from "ms"
import {
	Client,
	Intents,
	MessageEmbed,
	TextChannel,
	Message,
	CommandInteraction,
	GuildMember,
} from "discord.js"
import createLogFunc from "./log"
import { loadConfig, loadPinData, savePinData } from "./configuration"
import { fetchStatus, Status } from "./fetchStatus"
import { registerCommands } from "./registerCommands"

void registerCommands()

void (async () => {
	const client = new Client({
		intents: [Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES],
	})

	const config = await loadConfig()

	const pinData = await loadPinData()

	const gameDisplayName = config.game.charAt(0).toUpperCase() + config.game.slice(1)

	const generateDisplayIp = () => {
		const portString = config.gamePort === "" ? "" : `:${config.gamePort}`
		return `\`${config.gameHost}${portString}\``
	}
	const gameDisplayIp = generateDisplayIp()

	const TOKEN = process.env.TOKEN as string

	const log = createLogFunc(config.logging)

	const updatePresence = async (status: Status) => {
		let infoText = ""
		if (status.online) {
			infoText = ` | ${status.info.players.length}/${status.info.maxPlayers}`
		} else {
			infoText = " | Offline"
		}

		client.user?.setPresence({
			activities: [
				{
					type: "WATCHING",
					name: `${gameDisplayName}${infoText}`,
				},
			],
			status: status.online ? "online" : "idle",
		})
	}

	const updateStatus = async () => {
		log("Updating bot status")
		const status = await fetchStatus(config.game, config.gameHost, config.gamePort)
		await updatePresence(status)
		await updatePin(status)
		log(`Minecraft server online: ${status.online}`)
	}

	const fetchPinnedMessage = async (
		guildId: string | null,
		channelId: string | null,
		messageId: string | null
	) => {
		if (!messageId || !guildId || !channelId) return null

		const guild = client.guilds.cache.get(guildId)
		if (!guild) {
			log(`Unable to find pin guild.`)
			return null
		}

		let channel = guild.channels.cache.get(channelId) as TextChannel
		if (!channel) {
			channel = (await guild.channels.fetch(channelId)) as TextChannel
		}
		if (!channel) {
			log(`Unable to find pin channel.`)
			return null
		}

		const messages = await channel.messages.fetchPinned()
		const message = messages.get(messageId)
		if (!message) {
			log("Unable to find pinned message.")
			return null
		}

		return message
	}

	const updatePin = async (status: Status) => {
		try {
			const message = await fetchPinnedMessage(pinData.guildId, pinData.channelId, pinData.id)
			if (!message) {
				log("Pinned message not found, could not update")
				return
			}

			const embed = await createStatusEmbed(status)
			await message.edit({ embeds: [embed] })
			log("Updated pin.")
		} catch (err) {
			console.error("pin update failed", err)
		}
	}

	const ipCmd = async (interaction: CommandInteraction) => {
		try {
			await interaction.reply(`Server ip: ${gameDisplayIp}`)
		} catch (err) {
			console.error("ip command failed", err)
		}
	}

	const forceUpdateCmd = async (interaction: CommandInteraction) => {
		try {
			await interaction.reply({
				content: "Updating status and pinned message...",
				fetchReply: true,
				ephemeral: true,
			})
			await updateStatus()
			await interaction.editReply("Channels were updated successfully!")
		} catch (err) {
			console.error("force update cmd failed", err)
		}
	}

	const createStatusEmbed = (status: Status) => {
		let embed = new MessageEmbed()
			.setAuthor(gameDisplayName)
			.setColor(status.online ? "BLUE" : "RED")
		//.setFooter("")

		embed = embed.addFields({
			name: "Status",
			value: status.online ? "✅ Online" : "❌ Offline",
			inline: false,
		})

		if (status.online) {
			const playersString =
				config.showPlayerNames && status.info.players.length > 0
					? `: ${status.info.players.join(", ")}`
					: ""

			embed = embed.addFields(
				{
					name: "IP",
					value: gameDisplayIp,
				},
				{
					name: "Name",
					value: status.info.name || "\u200b",
				}
			)

			if (status.info.map) {
				embed = embed.addFields({
					name: "Map",
					value: status.info.map || "\u200b",
				})
			}

			embed = embed.addFields({
				name: "Players",
				value: `${status.info.players.length}/${status.info.maxPlayers}${playersString}`,
			})
		}

		return embed
	}

	const pinCmd = async (interaction: CommandInteraction) => {
		try {
			await interaction.reply({ content: "Creating status embed..." })

			const status = await fetchStatus(config.game, config.gameHost, config.gamePort)

			const embed = createStatusEmbed(status)

			const channel = (await interaction.guild?.channels.fetch(
				interaction.channelId
			)) as TextChannel

			const msg = await channel.send({ embeds: [embed] })

			const pinnedMsg = await msg.pin()

			log("Guild ID set: " + pinnedMsg.guild?.id)
			log("Channel ID set: " + pinnedMsg.channel.id)
			log("Pin message ID set: " + pinnedMsg.id)

			let oldPinRemoved = false

			if (pinData.guildId && pinData.channelId && pinData.id) {
				try {
					const oldMessage = await fetchPinnedMessage(
						pinData.guildId,
						pinData.channelId,
						pinData.id
					)
					if (oldMessage) {
						await oldMessage.unpin()
						oldPinRemoved = true
						log("Removed old pinned message: " + oldMessage.id)
					}
				} catch (err) {
					console.warn("couldn't unpin previous message", err)
				}
			}

			pinData.guildId = pinnedMsg.guild?.id ?? null
			pinData.channelId = pinnedMsg.channel.id
			pinData.id = pinnedMsg.id

			await savePinData(pinData)

			await interaction.editReply({
				content: `Status embed created${oldPinRemoved ? " and previous pin removed" : ""}`,
			})
		} catch (err) {
			await interaction.editReply({ content: "Creation failed" })
			console.error("pin cmd failed", err)
		}
	}

	client.on("ready", () => {
		console.log(`Ready. Logged as ${client.user?.tag}.`)
		updateStatus()
		setInterval(() => {
			updateStatus()
		}, ms(config.pinUpdateInterval))
	})

	client.on("interactionCreate", async (interaction) => {
		if (!interaction.isCommand()) return

		if (interaction.commandName === "ip") {
			ipCmd(interaction)
			return
		}

		if (!interaction.memberPermissions?.has("MANAGE_MESSAGES")) {
			await interaction.reply({
				content: "Failed: You don't have the `manage messages` permission",
			})
			return
		}

		if (interaction.commandName === "force-update") {
			forceUpdateCmd(interaction)
		} else if (interaction.commandName === "pin") {
			pinCmd(interaction)
		}
	})

	client.login(TOKEN)
})()
