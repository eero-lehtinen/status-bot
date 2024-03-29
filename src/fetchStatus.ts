import gamedig, { QueryOptions } from "gamedig"

export type Status =
	| { online: false }
	| {
			online: true
			info: {
				name: string
				map: string
				maxPlayers: number
				players: string[]
			}
	  }

export const fetchStatus = async (
	game: string,
	host: string,
	port: number | null
): Promise<Status> => {
	const g = game as QueryOptions["type"]
	try {
		const res = await gamedig.query({ type: g, host: host, port: port ?? undefined })
		return {
			online: true,
			info: {
				name: res.name,
				map: res.map,
				maxPlayers: res.maxplayers,
				players: res.players.map((p) => p.name ?? "unknown"),
			},
		}
	} catch (e) {
		return { online: false }
	}
}
