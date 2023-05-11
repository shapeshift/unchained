
# Unchained coinstack backup & restore

Automated backup can be configured via nodestack config. Alternatively, manual snapshots can be taken either with the use of `VolumeSnapshot` k8s crd's, or via the EC2 Volume Snapshot mechanism.

## Manual snapshot & restore

1. Manually scale the statefulset of the target coinstack to 0.
2. Take a snapshot in the AWS console of the PV/PVC you wish to restore from
3. Delete the PVC and the PV of the coinstack
4. Update the `restore-pvc.yaml` with the coinstack details
5. Apply the yaml and scale STS back up

## Automated restore from snapshot

1. Make sure some `volumesnapshot` exists for a given coinstack
2. Scale down via Pulumi, either by CircleCI or by running `pulumi up`
3. Manually delete the existing PV and PVC
4. Scale up via Pulumi, either by CircleCI or by running `pulumi up`

