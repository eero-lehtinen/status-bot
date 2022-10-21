import ms from "ms"
import {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	TextChannel,
	CommandInteraction,
	ActivityType,
	PermissionFlagsBits,
} from "discord.js"
import { format, utcToZonedTime, zonedTimeToUtc } from "date-fns-tz"
import createLogFunc from "./log"
import { loadConfig, loadPinData, savePinData } from "./configuration"
import { fetchStatus, Status } from "./fetchStatus"
import { registerCommands } from "./registerCommands"

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

void (async () => {
	const client = new Client({
		intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	})

	if (!process.argv[2]) throw new Error("You must supply game name as argument")

	const config = await loadConfig(process.argv[2])
	const pinData = await loadPinData(config.game)
	const gameDisplayName = config.game.charAt(0).toUpperCase() + config.game.slice(1)

	const generateDisplayIp = () => {
		const portString = !config.port ? "" : `:${config.port}`
		return `\`${config.host}${portString}\``
	}
	const gameDisplayIp = generateDisplayIp()

	const log = createLogFunc(config.logging)

	const updatePresence = async (status: Status) => {
		let infoText = ""
		if (status.online) {
			infoText = ` | ${status.info.players.length}/${status.info.maxPlayers}`
		} else {
			infoText = " | Offline"
		}

		client.user!.setPresence({
			activities: [
				{
					type: ActivityType.Watching,
					name: `${gameDisplayName}${infoText}`,
				},
			],
			status: status.online ? "online" : "idle",
		})

		log(
			`Set presence to ${gameDisplayName}${infoText} and status to ${
				status.online ? "online" : "idle"
			}`
		)
	}

	const updateStatus = async () => {
		log("Updating bot status")
		const status = await fetchStatus(config.game, config.host, config.port)
		log(`${gameDisplayName} server online: ${status.online}`)
		await updatePresence(status)
		await updatePin(status)
	}

	const fetchChannel = async (guildId: string | null, channelId: string | null) => {
		if (!guildId || !channelId) return null

		let guild = client.guilds.cache.get(guildId)
		if (!guild) {
			guild = await client.guilds.fetch(guildId)
		}
		if (!guild) {
			log(`Unable to find guild with id ${guildId}`)
			return null
		}

		let channel = guild.channels.cache.get(channelId) as TextChannel
		if (!channel) {
			channel = (await guild.channels.fetch(channelId)) as TextChannel
		}
		if (!channel) {
			log(`Unable to find channel with id ${channelId}`)
			return null
		}

		return channel
	}

	const fetchPinnedMessage = async (
		guildId: string | null,
		channelId: string | null,
		messageId: string | null
	) => {
		const channel = await fetchChannel(guildId, channelId)

		if (!messageId || !channel) return null

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
		const formattedTimeStamp = format(
			utcToZonedTime(zonedTimeToUtc(new Date(), timeZone), config.timeZone),
			"yyyy-MM-dd HH:mm:ss xxx",
			{ timeZone: config.timeZone }
		)

		let embed = new EmbedBuilder()
			.setAuthor({ name: gameDisplayName })
			.setColor(status.online ? "Blue" : "Red")
			.setFooter({ text: `Last update: ${formattedTimeStamp}` })

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

			if (config.showMapField && status.info.map) {
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

			const channel = await fetchChannel(interaction.guildId, interaction.channelId)
			if (!channel) throw new Error("Could not fetch interaction channel")

			const status = await fetchStatus(config.game, config.host, config.port)
			const embed = createStatusEmbed(status)
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

			await savePinData(pinData, config.game)

			await interaction.editReply({
				content: `Status embed created${oldPinRemoved ? " and previous pin removed" : ""}`,
			})
		} catch (err) {
			await interaction.editReply({ content: "Creation failed" })
			console.error("pin cmd failed", err)
		}
	}

	client.on("ready", () => {
		console.log(`Ready. Logged as ${client.user!.tag}.`)
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

		if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
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

	client.login(config.token)

	await registerCommands(config.token, config.appId)
})()
