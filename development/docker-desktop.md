# Docker Desktop

## **Prerequisites**

* Install [Helm](https://helm.sh/docs/intro/install/):

  ```bash
  brew install helm
  ```

* Add the Mongo Helm chart:

  ```bash
  helm repo add bitnami https://charts.bitnami.com/bitnami
  ```

* Go into [Docker Desktop](https://www.docker.com/products/docker-desktop) preferences and enable Kubernetes
* Create a [Pulumi](https://app.pulumi.com/) account
* Install the Pulumi CLI:

  ```bash
  brew install Pulumi
  ```

* Log into your pulumi account:

  ```bash
  pulumi login
  ```

## **Deploy Common Dependencies Stack**

* Copy sample pulumi configuration:

  ```bash
  cp pulumi/Pulumi.sample.yaml pulumi/Pulumi.docker-desktop.yaml
  ```

* Update `cluster` to `docker-desktop` in `pulumi/Pulumi.docker-desktop.yaml`
* In the `pulumi/` directory
  * Initialize your pulumi stack:

    ```bash
    pulumi stack init docker-desktop
    ```

  * Deploy common dependecies:

    ```bash
    pulumi up
    ```

## **Deploy Coinstack Stack**

* Copy sample env file:

  ```bash
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```

* Fill out any missing environment variables
* Copy sample pulumi configuration

  ```bash
  cp coinstacks/ethereum/pulumi/Pulumi.sample.yaml coinstacks/ethereum/pulumi/Pulumi.docker-desktop.yaml
  ```

* Update `stack` to the output value of `echo ${pulumi whoami}/common/docker-desktop`
* In the `coinstacks/ethereum/pulumi/` directory:
  * Initialize your pulumi stack:

    ```bash
    pulumi stack init docker-desktop
    ```

  * Deploy coinstack:

    ```bash
    pulumi up
    ```

## **Useful Commands**

* Show list of available pulumi stacks \(currently selected stack will have an asterisk next to the name\):

  ```bash
  pulumi stack ls
  ```

* Select your desired pulumi stack:

  ```bash
  pulumi stack select docker-desktop
  ```

* Completely tear down the kubernetes resources and pulumi stack state:

  ```bash
  pulumi destroy
  ```

* View localhost service [ports](../#ports):

  ```bash
  kubectl get svc --all-namespaces
  ```

* If you ever need/want a fresh cluster:
  * Destroy common dependencies stack state in `pulumi/`:

    ```bash
    pulumi destroy
    ```

  * Destroy coinstack pulumi stack state in `coinstacks/ethereum/pulumi/`:

    ```bash
    pulumi destroy
    ```

  * Go into the Docker Desktop dashboard
  * Click the beetle button \(Troubleshoot\)
  * Click "Reset Kubernetes Cluster" to delete all stacks and Kubernetes resources
* If enabling Kubernetes is hanging in docker desktop \(starting can take 5+ min depending on your hardware, so wait a little before trying\):
  * Go into Docker Desktop Dashboard
  * Click the beetle button \(Troubleshoot\)
  * Click "Clean/Purge Data"

