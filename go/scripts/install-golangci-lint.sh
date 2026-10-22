#!/usr/bin/env bash
set -euo pipefail

version=${1:?version required}
destination=${2:?destination required}
os=$(uname -s | tr '[:upper:]' '[:lower:]')
case $(uname -m) in
  x86_64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unsupported architecture' >&2; exit 1 ;;
esac

archive="golangci-lint-${version}-${os}-${arch}.tar.gz"
checksums="golangci-lint-${version}-checksums.txt"
url="https://github.com/golangci/golangci-lint/releases/download/v${version}"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

curl --fail --silent --show-error --location "$url/$archive" -o "$workdir/$archive"
curl --fail --silent --show-error --location "$url/$checksums" -o "$workdir/$checksums"

# Match the full filename, excluding the archive's .sbom.json checksum.
awk -v archive="$archive" '$2 == archive { print; count++ } END { if (count != 1) exit 1 }' \
  "$workdir/$checksums" > "$workdir/selected-checksum"
if command -v sha256sum >/dev/null; then
  (cd "$workdir" && sha256sum --check selected-checksum)
else
  (cd "$workdir" && shasum -a 256 --check selected-checksum)
fi

tar -xzf "$workdir/$archive" -C "$workdir" \
  "golangci-lint-${version}-${os}-${arch}/golangci-lint"
mkdir -p "$(dirname "$destination")"
install -m 755 "$workdir/golangci-lint-${version}-${os}-${arch}/golangci-lint" "$destination"
