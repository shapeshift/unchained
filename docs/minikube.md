# Minikube (Linux):

## **Prerequisites**

- Install [minikube](https://minikube.sigs.k8s.io/docs/start/)
- Create a [pulumi](https://app.pulumi.com/) account
- Install the pulumi CLI:
  ```sh
  curl -fsSL https://get.pulumi.com | sh
  ```
- Log into your pulumi account:
  ```sh
  pulumi login
  ```
- Start minikube and mount the unchained directory to provide hot reloading (run in root unchained directory for `$PWD`, otherwise, substitute `$PWD` with the absolute path to root unchained directory):
  ```sh
  minikube start --mount-string="$PWD:$PWD --mount"
  ```
- Install [helm](https://helm.sh/docs/intro/install/)
- Add mongo helm chart:
  ```sh
  helm repo add bitnami https://charts.bitnami.com/bitnami
  ```

## **Deploy Common Dependencies Stack**

- Copy sample pulumi configuration:
  ```sh
  cp pulumi/Pulumi.sample.yaml pulumi/Pulumi.minikube.yaml
  ```
- Update `cluster` to `minikube` in `pulumi/Pulumi.minikube.yaml`
- In the `pulumi/`
  - Initialize your pulumi stack:
    ```sh
    pulumi stack init minikube
    ```
  - Deploy common dependencies:
    ```sh
    pulumi up
    ```

## **Deploy Coinstack Stack**

- Copy sample env file:
  ```sh
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```
- Fill out any missing environment variables
- Copy sample pulumi configuration:
  ```sh
  cp coinstacks/ethereum/pulumi/Pulumi.sample.yaml coinstacks/ethereum/pulumi/Pulumi.minikube.yaml
  ```
- Update `stack` to the output value of `echo ${pulumi whoami}/common/minikube`
- In the `coinstacks/ethereum/pulumi/` directory:
  - Initialize your pulumi stack:
    ```sh
    pulumi stack init minikube
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
- View service [ports](../README.md#ports) created by minikube:
  ```sh
  minikube service list
  ```
- Metrics can be turned on with:
  ```sh
  minikube addons enable metrics-server
  ```
- You can stop minikube when you are not using it:
  ```sh
  minikube stop
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
  - Delete minikube cluster cluster:
    ```sh
    minikube delete
    ```
