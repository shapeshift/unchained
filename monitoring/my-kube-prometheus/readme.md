
# Unchained monitoring stack

This is a basic monitoring setup based on the [kube-prometheus](https://github.com/prometheus-operator/kube-prometheus) project. It works as follows:

-  `build.sh` generates the manifests from the jsonnet files
-  We need to manually apply the manifests to the cluster

All of the state is kept in the repo for visibility of the changes and to make it easy to roll back.

# Usage

```sh
./build.sh unchained-kube-promstack.jsonnet
kubectl apply --server-side -f manifests/setup
kubectl apply -f manifests/
```

# Customizing

https://github.com/prometheus-operator/kube-prometheus/blob/main/docs/customizing.md
