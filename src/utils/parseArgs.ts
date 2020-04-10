import commander, { createCommand } from "commander";
export default function parseArgs(argv: string[]): commander.Command {
  const program = createCommand();
  program.version("0.0.1");
  program
    .option(
      "-p, --preview",
      "Show migration preview (does not change any files)"
    )
    .option("-n, --migration-name <name>", "Set migration name", "noname")
    .option("-c, --comment <comment>", "Set migration comment", "")
    .option("-g, --migrations-path <path>", "The path to the migrations folder")
    .option("-m, --models-path <path>", "The path to the models folder")
    .option("-v, --verbose", "Show details about the execution")
    .option("-d, --debug", "Show error messages to debug problems")
    .option(
      "-k, --keep-files",
      "Don't delete previous files from the current revision (requires a unique --name option for each file)"
    )
    .parse(argv);
  return program;
}
