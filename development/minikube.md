# Minikube

## **Prerequisites**

* Install [minikube](https://minikube.sigs.k8s.io/docs/start/)
* Create a [pulumi](https://app.pulumi.com/) account
* Install the pulumi CLI:

  ```bash
  curl -fsSL https://get.pulumi.com | sh
  ```

* Log into your pulumi account:

  ```bash
  pulumi login
  ```

* Start minikube and mount the unchained directory to provide hot reloading \(run in root unchained directory for `$PWD`, otherwise, substitute `$PWD` with the absolute path to root unchained directory\):

  ```bash
  minikube start --mount-string="$PWD:$PWD --mount"
  ```

* Install [helm](https://helm.sh/docs/intro/install/)
* Add mongo helm chart:

  ```bash
  helm repo add bitnami https://charts.bitnami.com/bitnami
  ```

## **Deploy Common Dependencies Stack**

* Copy sample pulumi configuration:

  ```bash
  cp pulumi/Pulumi.sample.yaml pulumi/Pulumi.minikube.yaml
  ```

* Update `cluster` to `minikube` in `pulumi/Pulumi.minikube.yaml`
* In the `pulumi/`
  * Initialize your pulumi stack:

    ```bash
    pulumi stack init minikube
    ```

  * Deploy common dependencies:

    ```bash
    pulumi up
    ```

## **Deploy Coinstack Stack**

* Copy sample env file:

  ```bash
  cp coinstacks/ethereum/sample.env coinstacks/ethereum/.env
  ```

* Fill out any missing environment variables
* Copy sample pulumi configuration:

  ```bash
  cp coinstacks/ethereum/pulumi/Pulumi.sample.yaml coinstacks/ethereum/pulumi/Pulumi.minikube.yaml
  ```

* Update `stack` to the output value of `echo ${pulumi whoami}/common/minikube`
* In the `coinstacks/ethereum/pulumi/` directory:
  * Initialize your pulumi stack:

    ```bash
    pulumi stack init minikube
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

* View service [ports](../#ports) created by minikube:

  ```bash
  minikube service list
  ```

* Metrics can be turned on with:

  ```bash
  minikube addons enable metrics-server
  ```

* You can stop minikube when you are not using it:

  ```bash
  minikube stop
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

  * Delete minikube cluster cluster:

    ```bash
    minikube delete
    ```

