import figlet from 'figlet'
import { Command } from 'commander'
import { VolumeReaper } from './volumeReaper'

console.log(figlet.textSync('Unchained Volume Reaper'))

const program = new Command()

program
  .description(
    'A CLI for creating EBS Snapshots for Unchained. This CLI will stop a target StatefulSet, take a snapshot of an attached PVC, start the StatefulSet back up and finally, clean up older backups.'
  )
  .requiredOption('-a, --asset [value]', 'The asset to backup')
  .requiredOption('-s, --sts-services [value]', 'List of comma-separated service names in the StatefulSet')
  .requiredOption('-n, --namespace [value]', 'Kubernetes namespace')
  .option('-c, --count [value]', 'Total number of historic backups to keep', '1')
  .parse(process.argv)

const args = program.opts()

const volumeReaper = new VolumeReaper({
  assetName: String(args.asset),
  services: String(args.stsServices),
  namespace: String(args.namespace),
  backupCount: Number(args.count),
})

;(async () => {
  await volumeReaper.run()
})()
