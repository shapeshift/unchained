
# Unchained Backup Runner

A small Node.js CLI tool for creating k8s VolumeSnapshots for Unchained stateful sets.

## How it works

The tool is trigged via Cronjob in K8s. Based on the parameters, the following actions are performed:

- The statefulset is scaled down to 0 
- All PVC's claimed by the statefulset are snapshotted
- The statefulset is scaled back up
- All snapshots (VolumeClaims) over the configured number of backups are removed

## Usage

Run it locally or just see `index.ts`

## Run locally

`ts-node-esm dist/index.js`

## Build & Push a new version

If you're build on M1 as I am, you need to do a cross-arch build:

`docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t lukmyslinski/backuprunner:0.18 --push .`

Once the version is pushed, update it in `pulumi/src/cluster/sts/backup-cron.ts`

