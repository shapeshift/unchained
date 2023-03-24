
# Unchained Volume Reaper

A small Node.js CLI tool that automatically creates and deletes k8s VolumeSnapshots.

## How it works

The tool is trigged via Cronjob in K8s. Based on the parameters, the following actions are performed:

- The statefulset is scaled down 
- PV's claimed by the statefulset are snapshotted
- The statefulset is scaled back up
- All snapshots (VolumeClaims) over the configured number of backups are removed

## Usage

`yarn start -h`

## Run locally

`yarn dev`
