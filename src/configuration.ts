import { z } from "zod"
import toml from "@iarna/toml"
import fs from "fs/promises"

const configPath = "./config.json"
const pinDataPath = "./pinData.json"

const zConfig = z
	.object({
		game: z.string(),
		host: z.string(),
		port: z.number().nullable(),
		showMapField: z.boolean(),
		showPlayerNames: z.boolean(),
		logging: z.boolean(),
		pinUpdateInterval: z.string(),
		timeZone: z.string(),
		token: z.string(),
		appId: z.string(),
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

export const loadConfig = async (game: string): Promise<Config> => {
	const contents = await fs.readFile(configPath)
	const obj = JSON.parse(contents.toString())
	const config = (obj.gameConfigs as any[]).find((obj) => obj.game === game)
	return zConfig.parse(config)
}

export const loadPinData = async (game: string): Promise<PinData> => {
	let obj
	try {
		const contents = await fs.readFile(pinDataPath)
		obj = JSON.parse(contents.toString())[game]
		if (!obj) throw new Error("no pin data found for this game")
	} catch (err) {
		console.warn("pinData.json not found, using null defaults", err)
		return { id: null, guildId: null, channelId: null }
	}
	return zPinData.parse(obj)
}

export const savePinData = async (pinData: PinData, game: string) => {
	let obj
	try {
		const contents = await fs.readFile(pinDataPath)
		obj = JSON.parse(contents.toString())
		obj[game] = pinData
	} catch (err) {
		obj = { [game]: pinData }
	}

	await fs.writeFile(pinDataPath, JSON.stringify(obj))
}
