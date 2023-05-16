
# Unchained monitoring stack

This is a basic monitoring setup based on the [kube-prometheus](https://github.com/prometheus-operator/kube-prometheus) project. It works as follows:

-  `build.sh` generates the manifests from the jsonnet files
-  We need to manually apply the manifests to the cluster

The state is not kept in the repository, as it's a lot of generated yaml files.

This setup works in tandem with the existing Pulumi config, and the Pulumi monitoring config should be applied directly after deploying the changes configured here.

# Initial setup

Install [goland](https://go.dev/)
Install [jsonnet](https://github.com/google/jsonnet)
Install [jb](https://github.com/jsonnet-bundler/jsonnet-bundler#install)

Run `jb install`


# Usage

```sh
./build.sh unchained-kube-promstack.jsonnet
kubectl apply --server-side -f manifests/setup
kubectl apply -f manifests/
```

# Customizing

https://github.com/prometheus-operator/kube-prometheus/blob/main/docs/customizing.md
