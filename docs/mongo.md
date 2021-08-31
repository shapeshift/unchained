# Mongo Replicaset

The mongo-sidecar pod within the mongodb replicaset requires introspection capabilities to list pods in the cluster. Ideally we would restrict this further down.

Admin cluster RBAC is required to create the below two objects.

**NOTE**

* the `ClusterRole` will already exist by the time you are reading this
* a new `ClusterRoleBinding` will be required for each additional coinstack we add

```text
# this already exists

cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: mongo-replicaset-cr
rules:
- apiGroups:
  - ""
  resources:
  - pods
  verbs:
  - list
EOF
```

```text
# create me - replace <asset> as required

cat <<EOF | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: <asset>-mongo-replicaset-crb
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: mongo-replicaset-cr
subjects:
- kind: ServiceAccount
  name: default
  namespace: <asset>
EOF
```

