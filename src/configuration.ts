import { z } from "zod"
import toml from "@iarna/toml"
import fs from "fs/promises"
import { config } from "dotenv"

const configPath = "./config.toml"
const pinDataPath = "./pinData.json"

const zConfig = z
	.object({
		game: z.string(),
		gameHost: z.string(),
		gamePort: z.string(),
		showMapField: z.boolean(),
		showPlayerNames: z.boolean(),
		logging: z.boolean(),
		pinUpdateInterval: z.string(),
		timeZone: z.string(),
	})
	.strict()

export type Config = z.infer<typeof zConfig>

const zPinData = z
	.object({
		id: z.string().nullable(),
		guildId: z.string().nullable(),
		channelId: z.string().nullable(),
	})
	.strict()

export type PinData = z.infer<typeof zPinData>

export const loadConfig = async (): Promise<Config> => {
	const contents = await fs.readFile(configPath)
	const obj = toml.parse(contents.toString())
	return zConfig.parse(obj)
}
export const saveConfig = async (config: Config) => {
	await fs.writeFile(configPath, toml.stringify(config))
}

export const loadPinData = async (): Promise<PinData> => {
	let obj
	try {
		const contents = await fs.readFile(pinDataPath)
		obj = JSON.parse(contents.toString())
	} catch (err) {
		console.warn("pinData.json not found, using null defaults")
		return { id: null, guildId: null, channelId: null }
	}
	return zPinData.parse(obj)
}

export const savePinData = async (pinData: PinData) => {
	await fs.writeFile(pinDataPath, JSON.stringify(pinData))
}
