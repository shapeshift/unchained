import figlet from "figlet";
import { Command } from "commander";
import { runBackup } from "./backup.js";

console.log(figlet.textSync("Unchained Backup Runner"));

const program = new Command();

program
  .version("1.0.0")
  .description(
    "A CLI for creating EBS Snapshots for Unchained. This CLI will stop a target StatefulSet, take a snapshot of an attached PVC, start the StatefulSet back up and finally, clean up older backups."
  )
  .requiredOption(
    "-p, --pvcs [value]",
    "List of comma-separated PVC names to be snapshotted"
  )
  .requiredOption(
    "-s, --statefulset [value]",
    "Name of the StatefulSet which will be stopped/started"
  )
  .requiredOption("-n, --namespace [value]", "Kubernetes namespace")
  .option(
    "-c, --count [value]",
    "Total number of historic backups to keep",
    "1"
  )
  .option(
    "-r, --replicas [value]",
    "Total number of replicas to scale back to",
    "1"
  )
  .parse(process.argv);

const args = program.opts()

await runBackup({
  pvcList: String(args.pvcs),
  backupCount: Number(args.count),
  replicas: Number(args.replicas),
  statefulset: String(args.statefulset),
  namespace: String(args.namespace),
});