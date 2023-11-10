
# Unchained Snapshot & Restore

## Tools Needed
- [kubectl](https://kubernetes.io/docs/reference/kubectl/)
- [k9s](https://k9scli.io/)

**DO NOT SKIP ANY STEPS IF THIS IS YOUR FIRST TIME GOING THROUGH THE PROCESS**

## Manual Snapshot

This process involves scaling down a kubernetes statefulset to ensure no processes are writing to disk and manually taking a snapshot of the ebs volumes in aws. Remember to scale back up the statefulset after the snapshot is taken (no need to wait for the snapshot to complete fully to scale back up)

1. Manually scale the statefulset of the target coinstack down in k9s
	- Select the desired namespace with: `:ns` and highlight the namespace and press enter  
	![](k9s-ns.png)
	_if coinstacks are healthy in `unchained-dev` it is easiest to do it there to avoid any interruptions in production_  
	- Select desired statefulset with: `:sts` and highlight the statefulset (ex. `ethereum-sts`)  
	![](k9s-sts.png)
	- Scale statefulset with: `s` (set replica count to one less than current count and select `OK`)  
	![](k9s-s-replicas-1.png)![](k9s-s-replicas-0.png)
	- This will trigger the statefulset to scale down which will make the ebs volume available for snapshot
1. Take a snapshot of the target coinstack's EBS volumes in the AWS console
	- Navigate to `EC2` -> `Elastic Block Store` -> `Volumes`  
	![](aws-volumes-nav.png)
	- Search by coinstack name (ex. `ethereum`) and wait for the `Volume state` to show `Available`  
	![](aws-volumes-search.png)
	- EBS volumes created by kubernetes do not show a `Name`, but you can view the `Tags` to see what volume you are looking at (namespace and pvc name)  
	![](aws-volumes-tags.png)
	- Right click and select `Create snapshot`  
	![](aws-volumes-create-snapshot.png)
	- Enter the description in the form of `{coinstack}-{service}` and select `Create snapshot` (ex. `ethereum-indexer`, `ethereum-daemon`, `ethereum-daemon-beacon`)  
	![](aws-volumes-create-snapshot-details.png)
	- Repeat for each volume in the coinstack
1. Manually scale the statefulset of the target coinstack back up in k9s (NOTE: you do not have to wait for the ebs snapshot to complete before scaling back up)  
	![](k9s-s-replicas-0.png)![](k9s-s-replicas-1.png)
1. Wait for snapshot to complete 
	- Navigate to `EC2` -> `Elastic Block Store` -> `Snapshots`  
	![](aws-snapshots-nav.png)
	- `Snapshot status` will go from `Pending` -> `Complete`  
	![](aws-snapshots-status.png)

## Manual Restore

This process involves scaling down a kubenetes statefulset in order to remove any existing pvcs and pvs associated with the replica you wish to restore, creating a new ebs volume from an aws snapshot, and then manually applying a kubernetes yaml file to create a new pvc and pv pointed at the new ebs volume created. Take note of volume size and availability zone to ensure that you recreate the pvc and pv correctly.

1. Manually scale the statefulset of the target coinstack down in k9s (see above)
1. Delete the pvc associated with the statefulset replica to be restored
	- Select desired namespace with: `:ns` and highlight the namespace and press enter  
	- Select desired pvc with `:pvc` and highlight the pvc (ex. `data-daemon-ethereum-sts-0`)  
	![](pvc.png)
	- Take note of the `VOLUME` name to know which pv to delete associated with this pvc (ex. `data-daemon-ethereum-sts-0-pv`)
	![](pvc-volume-name.png)
	- Delete the pvc with `ctrl+d` and select `OK`  
	![](pvc-delete.png)
1. Delete the pv associated with pvc deleted above
	- Note:
		- `RECLAIM POLICY` indicates whether the pv and associated ebs volume will be `Retain` or `Delete` upon deletion of the pvc. If the pv is not shown after deleting the pvc, this would imply it was set for the `Delete` policy
		- `STATUS` indicates whether the pv is `Bound` (pvc exists) or is `Released` (pvc has been deleted)
	- Select desired pv with `:pv` and highlight the pv (ex. `data-daemon-ethereum-sts-0-pv`)  
	![](pv.png)
	- Take note of the `CLAIM` name as another way to see what pvc is associated (format is `{namespace}/{pvc_name}`)
	![](pv-claim-name.png)
	- Take note of what availability zone the pv is in before deleting (needed for creating the new volume in the correct AZ).
		- Describe the pv with: `d`  
		![](pv-az.png)
	- Delete the pv with `ctrl+d` and select `OK`  
	![](pv-delete.png)
1. Create new EBS volume from snapshot
	- Navigate to `EC2` -> `Elastic Block Store` -> `Snapshots`
	- Right click and select `Create volume from snapshot`  
	![](aws-snapshots-create-volume.png)
	- Use the pre-filled `Volume type` and `Size`
	- Select the correct `Availability Zone`  
	![](aws-snapshots-create-volume-details-az.png)
	- Add a `Name` tag for the specific volume being created in the form of `data-{service}-{coinstack}-sts-{replicaNumber}` and add `-dev` suffix if it is a coinstack in the `unchained-dev` namespace  
	![](aws-snapshots-create-volume-details-tags.png)
	- Click `Create volume`
1. Edit the [restore-pvc.yaml](./restore-pvc.yaml). This will be used to apply the new kubernetes resources (pvc + pv)
	- Replace all `<items>` with the appropriate data:
		- `PersistentVolume.metadata.name` is suffixed with `-pv` (or `-pv-dev` for `unchained-dev` namespace)
		- `PersistentVolume.spec.capacity.storage` must match the size of the EBS volume
		- `PersistentVolume.spec.csi.volumeHandle` is the `Volume ID` of the EBS volume  
		![](aws-volume-id.png)
		- `PersistentVolume.spec.nodeAffinity...` region must match the `Availability Zone` of the EBS volume  
		![](aws-volume-az.png)
		- `PersistentVolumeClaim.metadata.name` follows the format of `data-{service}-{coinstack}-sts-{replicaNumber}`
		- `PersistentVolumeClaim.metadata.namespace` must match the namespace of the statefulset
		- `PersistentVolumeClaim.metadata.labels.asset` is the coinstack name
		- `PersistentVolumeClaim.spec.resources.requests.storage` must match the size of the EBS volume
		- `PersistentVolumeClaim.spec.volumeName` must match `PersistentVolume.metadata.name`
	- Example:  
	![](restore-pvc-example.png)
	- Write the file (**don't check in changes after restore is complete**)
1. Apply the yaml to create the new pvc and pv
	- _You need to be pointing to the correct kube context when applying the yaml. We only have one EKS cluster so you should only have to set the context once. To verify and/or set the context, you can follow these steps:
		- Verify you are pointing at the correct kube context: `kubectl config current-context`
			- View all available contexts: `kubectl config get-contexts`
			- Set kube context: `kubectl config set-context {context_name}`
	- Apply the yaml: `kubectl apply -f path/to/restore-pvc.yaml`
	- Observe the pvc and pv are created in k9s
1. Manually scale the statefulset of the target coinstack back up in k9s (see above)
	- New ebs volumes take a bit of time to "warm" so initial start up after restore will be slow
	- Observe the statefulset is syncing and restored successfully