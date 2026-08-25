import * as fs from 'fs'
import * as path from 'path'
import { loadSequelize, runCli, type CliIo } from './cli'

/**
 * Config fixtures live inside the project tree, not os.tmpdir(): they `require`
 * sequelize-typescript, which only resolves from a directory that can walk up to this
 * repo's node_modules.
 */
const tmpRoot = path.join(__dirname, '..', '.tmp-test')

let workDir: string
let io: CliIo & { logs: string[]; errors: string[] }

beforeEach(() => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	workDir = fs.mkdtempSync(path.join(tmpRoot, 'cli-'))

	const logs: string[] = []
	const errors: string[] = []
	io = {
		logs,
		errors,
		log: (message) => logs.push(message),
		error: (message) => errors.push(message),
	}
})

afterEach(() => {
	fs.rmSync(workDir, { recursive: true, force: true })
})

/** Writes a config module that exports a real sqlite-backed Sequelize. */
const writeConfig = (body: string, filename = 'config.js') => {
	const file = path.join(workDir, filename)
	fs.writeFileSync(file, body)
	delete require.cache[file]
	return file
}

const SEQUELIZE_SETUP = `
require('reflect-metadata')
const { Sequelize, Model, Table, Column, PrimaryKey, DataType } = require('sequelize-typescript')

class Widget extends Model {}
Table({ tableName: 'widgets', timestamps: false })(Widget)
Column(DataType.INTEGER)(Widget.prototype, 'id')
PrimaryKey(Widget.prototype, 'id')
Column(DataType.STRING(50))(Widget.prototype, 'label')

const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: ':memory:',
	logging: false,
	models: [Widget],
})
`

describe('runCli', () => {
	describe('help and version', () => {
		it('--help은 사용법을 출력하고 0으로 끝난다', async () => {
			await expect(runCli(['--help'], io)).resolves.toBe(0)
			expect(io.logs.join('\n')).toContain('Usage:')
		})

		it('-h도 같다', async () => {
			await expect(runCli(['-h'], io)).resolves.toBe(0)
			expect(io.logs.join('\n')).toContain('Usage:')
		})

		it('--version은 패키지 버전을 출력한다', async () => {
			await expect(runCli(['--version'], io)).resolves.toBe(0)
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			expect(io.logs[0]).toBe(require('../package.json').version)
		})
	})

	describe('argument validation', () => {
		it('인자가 없으면 1로 끝나고 안내를 낸다', async () => {
			await expect(runCli([], io)).resolves.toBe(1)
			expect(io.errors.join('\n')).toContain('required')
		})

		it.each([
			['--config만 있을 때', ['--config', 'x.js']],
			['--out-dir만 있을 때', ['--out-dir', 'migrations']],
		])('%s 1로 끝난다', async (_label, argv) => {
			await expect(runCli(argv, io)).resolves.toBe(1)
			expect(io.errors.join('\n')).toContain('required')
		})

		it('알 수 없는 플래그는 사용법과 함께 1로 끝난다', async () => {
			await expect(runCli(['--nope'], io)).resolves.toBe(1)
			expect(io.errors.join('\n')).toContain('Usage:')
		})

		it('위치 인자는 받지 않는다', async () => {
			await expect(runCli(['extra'], io)).resolves.toBe(1)
		})
	})

	describe('generating a migration', () => {
		const run = (extra: string[] = []) => {
			const config = writeConfig(
				`${SEQUELIZE_SETUP}\nmodule.exports = sequelize\n`,
			)
			const outDir = path.join(workDir, 'migrations')
			fs.mkdirSync(outDir, { recursive: true })
			return runCli(
				['--config', config, '--out-dir', outDir, ...extra],
				io,
			).then((code) => ({ code, outDir }))
		}

		it('마이그레이션 파일을 만들고 0으로 끝난다', async () => {
			const { code, outDir } = await run(['--name', 'initial'])

			expect(code).toBe(0)
			expect(fs.readdirSync(outDir)).toEqual(['00000001-initial.js'])
		})

		it('이름을 주지 않으면 noname을 쓴다', async () => {
			const { outDir } = await run()

			expect(fs.readdirSync(outDir)).toEqual(['00000001-noname.js'])
		})

		it('--comment를 마이그레이션에 기록한다', async () => {
			const { outDir } = await run(['--comment', 'first cut'])
			const contents = fs.readFileSync(
				path.join(outDir, fs.readdirSync(outDir)[0]),
				'utf8',
			)

			expect(contents).toContain('first cut')
		})

		it('--preview는 파일을 만들지 않는다', async () => {
			const { code, outDir } = await run(['--preview'])

			expect(code).toBe(0)
			expect(fs.readdirSync(outDir)).toEqual([])
		})

		it('-p도 같다', async () => {
			const { outDir } = await run(['-p'])

			expect(fs.readdirSync(outDir)).toEqual([])
		})

		it('상대 경로 out-dir을 절대 경로로 바꾼다', async () => {
			const config = writeConfig(
				`${SEQUELIZE_SETUP}\nmodule.exports = sequelize\n`,
			)
			const outDir = path.join(workDir, 'migrations')
			fs.mkdirSync(outDir, { recursive: true })
			const relative = path.relative(process.cwd(), outDir)

			await expect(
				runCli(['--config', config, '--out-dir', relative], io),
			).resolves.toBe(0)
			expect(fs.readdirSync(outDir)).toHaveLength(1)
		})

		it('outDir이 없으면 1로 끝나고 이유를 낸다', async () => {
			const config = writeConfig(
				`${SEQUELIZE_SETUP}\nmodule.exports = sequelize\n`,
			)

			await expect(
				runCli(
					[
						'--config',
						config,
						'--out-dir',
						path.join(workDir, 'nope'),
					],
					io,
				),
			).resolves.toBe(1)
			expect(io.errors.join('\n')).toContain('not exists')
		})

		it('--debug는 스택 트레이스를 낸다', async () => {
			const config = writeConfig(
				`${SEQUELIZE_SETUP}\nmodule.exports = sequelize\n`,
			)

			await runCli(
				[
					'--config',
					config,
					'--out-dir',
					path.join(workDir, 'nope'),
					'--debug',
				],
				io,
			)

			expect(io.errors.join('\n')).toContain('at ')
		})
	})
})

describe('loadSequelize', () => {
	describe('accepted export shapes', () => {
		it.each([
			['module.exports 자체', 'module.exports = sequelize'],
			['named sequelize export', 'module.exports = { sequelize }'],
			['default export', 'module.exports = { default: sequelize }'],
		])('%s를 받아들인다', (_label, exportLine) => {
			const config = writeConfig(`${SEQUELIZE_SETUP}\n${exportLine}\n`)

			expect(loadSequelize(config)).toBeDefined()
		})

		it('여러 export가 있으면 default를 먼저 고른다', () => {
			const config = writeConfig(
				`${SEQUELIZE_SETUP}\nmodule.exports = { default: sequelize, sequelize: null }\n`,
			)

			expect(loadSequelize(config)).toBeDefined()
		})
	})

	describe('rejected inputs', () => {
		it('존재하지 않는 파일이면 경로를 담은 예외를 던진다', () => {
			expect(() =>
				loadSequelize(path.join(workDir, 'missing.js')),
			).toThrow(/Could not load .*missing\.js/)
		})

		it('Sequelize가 아닌 것을 export하면 어떻게 export하라고 알려준다', () => {
			const config = writeConfig("module.exports = { hello: 'world' }\n")

			expect(() => loadSequelize(config)).toThrow(
				/did not export a Sequelize instance/,
			)
		})

		it('빈 모듈도 마찬가지다', () => {
			const config = writeConfig('module.exports = {}\n')

			expect(() => loadSequelize(config)).toThrow(
				/did not export a Sequelize instance/,
			)
		})

		it('TypeScript 파일 로드에 실패하면 로더가 필요하다고 알려준다', () => {
			// Note this uses a path that does not exist. Inside jest, ts-jest's transform
			// makes `require` of a real .ts file succeed, so the only way to reach the
			// failure branch here is a missing file -- which takes the same path a
			// consumer hits when they run the CLI under plain node without a loader.
			expect(() =>
				loadSequelize(path.join(workDir, 'database.ts')),
			).toThrow(/need a loader/)
		})

		it('그 안내에 실행 방법을 함께 준다', () => {
			expect(() =>
				loadSequelize(path.join(workDir, 'database.ts')),
			).toThrow(/tsx/)
		})

		it('원래 에러도 함께 보여준다', () => {
			expect(() =>
				loadSequelize(path.join(workDir, 'database.ts')),
			).toThrow(/Original error/)
		})
	})
})
