# Remote Unchained Deployment

run your own [uncahined api](https://api.ethereum.shapeshift.com/docs/#/)

### dependencies:

- [pulumi](https://www.pulumi.com)
- [dockerhub](https://hub.docker.com/)
- [circleci](https://circleci.com/)
- [aws](https://aws.amazon.com/)
- [etherscan](https://etherscan.io/)
- [npm](https://www.npmjs.com/)

an owned domain name\* to host unchained
dns registrar (ex [godaddy](https://www.godaddy.com/))

### ShapeShift tools

[repo](https://github.com/shapeshift/cluster-launcher)

### overview

1. fork unchained repo
2. setup AWS account
3. use cluster launcher to setup k8 cluster
4. setup circle.
5. sign up for npm
6. sign up for dockerhub
7. sign up for etherscan
8. sign up for rabbitmq cloud service?

### Domain Registration

buy a domain

### dockerhub

get api token
https://docs.docker.com/docker-hub/access-tokens/

### pulumi

get pulumi token
https://www.pulumi.com/docs/reference/cli/pulumi_login/

### aws

signup for account
get aws credentials

```
region=us-east-1
aws_access_key_id = ****
aws_secret_access_key = ****
```

deploy cluster with cluster launcher

setup rout53 hosted zone
point dns on owned domain to zone

### circleci

- go to forked project

setup configs:

get your pulumi access token

```
ROOT_DOMAIN_NAME=**
ADDITIONAL_ROOT_DOMAIN_NAME=**
PULUMI_ORG=**
PULUMI_ACCESS_TOKEN=**
AWS_ACCESS_KEY_ID=**
AWS_REGION=**
AWS_SECRET_ACCESS_KEY=**
BROKER_URL=**
DOCKERHUB_PASSWORD=**
DOCKERHUB_USERNAME=**
ETHERSCAN_API_KEY=**
NPM_TOKEN=**
```

- start building

1. pulumi deploy dependencies stack
