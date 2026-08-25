import * as fs from 'fs'
import * as path from 'path'

/**
 * Deletes migration files already written for this revision, so re-running makeMigration
 * replaces the previous attempt instead of piling up duplicates.
 *
 * Deleting is best effort: failing to clean up old files must never abort a run that has
 * otherwise succeeded.
 */
export default function removeCurrentRevisionMigrations(
	revision: number,
	migrationsPath: string,
	options: { keepFiles?: boolean; verbose?: boolean; debug?: boolean },
): boolean {
	if (options.keepFiles) {
		return false
	}

	let files: string[]
	try {
		files = fs.readdirSync(migrationsPath)
	} catch (err) {
		if (options.debug) {
			console.error(`Failed to read migrations directory: ${err}`)
		}
		return false
	}

	let hasRemoved = false

	for (const file of files) {
		if (!isSameRevision(file, revision)) {
			continue
		}

		try {
			fs.unlinkSync(path.join(migrationsPath, file))
			hasRemoved = true
			if (options.verbose) {
				console.log(`Successfully deleted ${file}`)
			}
		} catch (err) {
			if (options.debug) {
				console.error(`Failed to delete migration file ${file}: ${err}`)
			}
		}
	}

	return hasRemoved
}

/**
 * Compares numerically, not as strings.
 *
 * Filenames are written zero-padded ("00000001-name.js") while the revision is a plain
 * number, so the previous `file.split('-')[0] === revision.toString()` compared
 * "00000001" against "1" and never matched -- meaning nothing was ever deleted.
 */
function isSameRevision(filename: string, revision: number): boolean {
	const fileRevision = Number.parseInt(filename.split('-')[0], 10)
	return !Number.isNaN(fileRevision) && fileRevision === revision
}
