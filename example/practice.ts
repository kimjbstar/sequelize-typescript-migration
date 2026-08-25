import * as path from 'path'
import { Sequelize } from 'sequelize-typescript'
import { SequelizeTypescriptMigration } from 'sequelize-typescript-migration'
import { Car } from './models/car.model'
import { CarBrand } from './models/car_brand.model'

/**
 * Minimal end-to-end example. Copy .env.sample, point it at a scratch database, then:
 *
 *   npm install
 *   npm run practice
 *   npx sequelize db:migrate
 */
const bootstrap = async () => {
	const sequelize = new Sequelize({
		dialect: 'mysql',
		host: process.env.SEQUELIZE_HOST ?? '127.0.0.1',
		port: Number(process.env.SEQUELIZE_PORT ?? 3306),
		username: process.env.SEQUELIZE_USERNAME ?? 'root',
		password: process.env.SEQUELIZE_PASSWORD ?? '',
		database: process.env.SEQUELIZE_DATABASE ?? 'test_migration',
		models: [CarBrand, Car],
		timezone: '+09:00',
		logging: false,
	})

	const result = await SequelizeTypescriptMigration.makeMigration(sequelize, {
		outDir: path.join(__dirname, './migrations'),
		// Start here. Read what it would generate before letting it write anything.
		preview: true,
	})

	console.log(result)
	await sequelize.close()
}

bootstrap().catch((err) => {
	console.error(err)
	process.exitCode = 1
})
