# Docker Desktop (macOS):

## **Prerequisites**

- Install [Helm](https://helm.sh/docs/intro/install/):
  ```sh
  brew install helm
  ```
- Add the Mongo Helm chart:
  ```sh
  helm repo add bitnami https://charts.bitnami.com/bitnami
  ```
- Go into [Docker Desktop](https://www.docker.com/products/docker-desktop) preferences and enable Kubernetes
- Create a [Pulumi](https://app.pulumi.com/) account
- Install the Pulumi CLI:
  ```sh
  brew install Pulumi
  ```
- Log into your pulumi account:
  ```sh
  pulumi login
  ```

## **Deploy Common Dependencies Stack**

- Copy sample pulumi configuration:
  ```sh
  cp pulumi/Pulumi.sample.yaml pulumi/Pulumi.docker-desktop.yaml
  ```
- Update `cluster` to `docker-desktop` in `pulumi/Pulumi.docker-desktop.yaml`
- In the `pulumi/` directory
  - Initialize your pulumi stack:
    ```sh
    pulumi stack init docker-desktop
    ```
  - Deploy common dependecies:
    ```sh
    pulumi up
    ```

## **Deploy Coinstack Stack**

- Copy sample env file:
  ```sh
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```
- Fill out any missing environment variables
- Copy sample pulumi configuration
  ```sh
  cp coinstacks/ethereum/pulumi/Pulumi.sample.yaml coinstacks/ethereum/pulumi/Pulumi.docker-desktop.yaml
  ```
- Update `stack` to the output value of `echo ${pulumi whoami}/common/docker-desktop`
- In the `coinstacks/ethereum/pulumi/` directory:
  - Initialize your pulumi stack:
    ```sh
    pulumi stack init docker-desktop
    ```
  - Deploy coinstack:
    ```sh
    pulumi up
    ```

## **Useful Commands**

- Show list of available pulumi stacks (currently selected stack will have an asterisk next to the name):
  ```sh
  pulumi stack ls
  ```
- Select your desired pulumi stack:
  ```sh
  pulumi stack select docker-desktop
  ```
- Completely tear down the kubernetes resources and pulumi stack state:
  ```sh
  pulumi destroy
  ```
- View localhost service [ports](../README.md#ports):
  ```sh
  kubectl get svc --all-namespaces
  ```
- If you ever need/want a fresh cluster:
  - Destroy common dependencies stack state in `pulumi/`:
    ```sh
    pulumi destroy
    ```
  - Destroy coinstack pulumi stack state in `coinstacks/ethereum/pulumi/`:
    ```sh
    pulumi destroy
    ```
  - Go into the Docker Desktop dashboard
  - Click the beetle button (Troubleshoot)
  - Click "Reset Kubernetes Cluster" to delete all stacks and Kubernetes resources
- If enabling Kubernetes is hanging in docker desktop (starting can take 5+ min depending on your hardware, so wait a little before trying):
  - Go into Docker Desktop Dashboard
  - Click the beetle button (Troubleshoot)
  - Click "Clean/Purge Data"
