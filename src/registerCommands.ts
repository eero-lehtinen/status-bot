import { REST } from "@discordjs/rest"
import { Routes } from "discord-api-types/v9"

export const commands = [
	{
		name: "ip",
		description: "Show game server ip",
	},
	{
		name: "force-update",
		description: "Force-update status now",
	},
	{
		name: "pin",
		description: "Post continuously updating message of server status and pin it",
	},
]

const APP_ID = process.env.APP_ID as string
const TOKEN = process.env.TOKEN as string

const rest = new REST({ version: "9" }).setToken(TOKEN)

export const registerCommands = async () => {
	try {
		console.log("Started refreshing application (/) commands.")

		await rest.put(Routes.applicationCommands(APP_ID), { body: commands })

		//await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: {} })

		console.log("Successfully reloaded application (/) commands.")
	} catch (error) {
		console.error(error)
	}
}
