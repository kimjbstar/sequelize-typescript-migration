import type { IndexesOptions } from 'sequelize'
import parseIndex from './parseIndex'

/**
 * IndexesOptions declares `fields` as a narrower union than Sequelize actually accepts at
 * runtime, so fixtures go through one helper and the cast stays in a single place.
 */
const index = (options: Record<string, unknown>): IndexesOptions =>
	options as IndexesOptions

const hashOf = (options: Record<string, unknown>) =>
	parseIndex(index(options)).hash

describe('parseIndex', () => {
	describe('copied properties', () => {
		it('알려진 인덱스 옵션만 결과에 복사한다', () => {
			const parsed = parseIndex(
				index({
					name: 'idx_user_email',
					unique: true,
					fields: ['email'],
					concurrently: undefined,
				}),
			)

			expect(parsed).toMatchObject({
				name: 'idx_user_email',
				unique: true,
				fields: ['email'],
			})
			expect(parsed).not.toHaveProperty('concurrently')
		})

		it('목록에 없는 속성은 결과에 넣지 않는다', () => {
			expect(
				parseIndex(index({ name: 'idx', fields: ['a'], bogus: 1 })),
			).not.toHaveProperty('bogus')
		})
	})

	describe('addIndex options', () => {
		it('이름이 있으면 indexName 옵션으로 옮긴다', () => {
			expect(
				parseIndex(index({ name: 'idx_a', fields: ['a'] })).options,
			).toMatchObject({ indexName: 'idx_a' })
		})

		it('unique 인덱스는 indicesType을 UNIQUE로 설정한다', () => {
			expect(
				parseIndex(
					index({ name: 'idx_a', unique: true, fields: ['a'] }),
				).options,
			).toMatchObject({ indicesType: 'UNIQUE' })
		})

		it('parser가 있으면 옵션에 담는다', () => {
			expect(
				parseIndex(
					index({ name: 'idx', fields: ['a'], parser: 'ngram' }),
				).options,
			).toMatchObject({ parser: 'ngram' })
		})

		it('parser가 빈 문자열이면 옵션에 담지 않는다', () => {
			expect(
				parseIndex(index({ name: 'idx', fields: ['a'], parser: '' }))
					.options,
			).not.toHaveProperty('parser')
		})

		it('이름이 없으면 indexName 없이 빈 options를 만든다', () => {
			expect(parseIndex(index({ fields: ['a'] })).options).toEqual({})
		})
	})

	describe('hash identity', () => {
		it('같은 입력에 대해 같은 해시를 만든다', () => {
			const options = { name: 'idx_a', unique: true, fields: ['a', 'b'] }

			expect(hashOf(options)).toBe(hashOf({ ...options }))
		})

		it('다른 인덱스는 다른 해시를 만든다', () => {
			expect(hashOf({ name: 'a', fields: ['a'] })).not.toBe(
				hashOf({ name: 'b', fields: ['b'] }),
			)
		})

		// Regression: the hash was sha1 over `JSON.stringify(idx)`, so it changed when
		// decorator options were merely reordered -- a change with no effect on the
		// database. The differ read that as "drop this index and add another", which on a
		// large table is an outage rather than cosmetic churn.
		it('키 순서가 달라도 같은 해시를 만든다', () => {
			expect(hashOf({ name: 'idx', unique: true, fields: ['x'] })).toBe(
				hashOf({ unique: true, fields: ['x'], name: 'idx' }),
			)
		})

		it('문자열 필드와 { name } 필드를 같은 것으로 본다', () => {
			// Sequelize accepts both spellings and uses them interchangeably.
			expect(hashOf({ name: 'idx', fields: ['email'] })).toBe(
				hashOf({ name: 'idx', fields: [{ name: 'email' }] }),
			)
		})

		it('해시에 영향을 주지 않는 잉여 속성은 무시한다', () => {
			expect(hashOf({ name: 'idx', fields: ['a'] })).toBe(
				hashOf({
					name: 'idx',
					fields: ['a'],
					somethingElse: 'ignored',
				}),
			)
		})

		it('필드 순서가 다르면 다른 해시를 만든다', () => {
			// (a, b) and (b, a) are genuinely different indexes.
			expect(hashOf({ name: 'idx', fields: ['a', 'b'] })).not.toBe(
				hashOf({ name: 'idx', fields: ['b', 'a'] }),
			)
		})

		it.each([
			['unique', { unique: true }],
			['type', { type: 'FULLTEXT' }],
			['using', { using: 'BTREE' }],
			['where', { where: { deletedAt: null } }],
		])('%s가 다르면 다른 해시를 만든다', (_label, extra) => {
			expect(hashOf({ name: 'idx', fields: ['a'] })).not.toBe(
				hashOf({ name: 'idx', fields: ['a'], ...extra }),
			)
		})

		it('필드의 order나 length가 다르면 다른 해시를 만든다', () => {
			expect(hashOf({ name: 'idx', fields: [{ name: 'a' }] })).not.toBe(
				hashOf({ name: 'idx', fields: [{ name: 'a', order: 'DESC' }] }),
			)
		})
	})
})
