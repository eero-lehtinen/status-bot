const util = require("minecraft-server-util")

const run = async() => {
	try {
		const res = await util.status("mc.eerolehtinen.fi", { timeout: 2000})
		console.log(res)
	}
	catch (err) {
		console.error(err)
	}
}

run()