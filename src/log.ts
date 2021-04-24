const createLogFunc = (logging: boolean) => {
	return (message: string) => {
		if (logging) console.log(message)
	}
}

export default createLogFunc
