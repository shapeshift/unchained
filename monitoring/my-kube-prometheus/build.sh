#!/usr/bin/env bash

# This script uses arg $1 (name of *.jsonnet file to use) to generate the manifests/*.yaml files.
set -e
# only exit with zero if all commands of the pipeline exit successfully
set -o pipefail

# Make sure to use project tooling
PATH="$(pwd)/tmp/bin:${PATH}"

# Make sure to start with a clean 'manifests' dir
rm -rf manifests
mkdir -p manifests/setup

echo "Injecting secrets"

# Replace `<<discord_webhook_url>>` with the value of DISCORD_WEBHOOK_URL and create a new file
sed "s|<<discord_webhook_url>>|$DISCORD_WEBHOOK_URL|g" "alertmanager-config.tmpl.yaml" > "alertmanager-config.yaml"

echo "Generating manifests"

# Calling gojsontoyaml is optional, but we would like to generate yaml, not json
jsonnet -J vendor -m manifests "${1-example.jsonnet}" --ext-str grafana_admin_password=$GRAFANA_PASSWORD | xargs -I{} sh -c 'cat {} | gojsontoyaml > {}.yaml' -- {}

echo "Cleaning up"

# Make sure to remove json files
find manifests -type f ! -name '*.yaml' -delete
rm -f kustomization

echo "Done"

