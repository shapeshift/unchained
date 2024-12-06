# Unchained Monitoring

Deploys a collection of software that enables us to aggregate logs, collect metrics and view data.

_This stack is experimental, use at your own risk_

## Design
Helm brings a valuable level of abstraction to this stack so that maintenance tasks should be lessened. Instead of implementing a stack that brings all of these components, we decided to bring each discrete component separately for ease of configuring each component. Splitting monitoring out into its own pulumi stack allows us to deploy out-of-band relative to common deploys, making quick changes to IAC as cluster behavior changes. 

##### Global considerations:
* All stateful components have been specified to create as StatefulSets instead of Deployments. This is to ensure multiple pods don't try to claim the same PVC during updates.  

##Components

### Grafana (Data Visualization)
[Helm Chart](https://github.com/grafana/helm-charts/tree/main/charts/grafana)

##### Requirements:
* Github OAuth
* Cert manager
* Traefik (ingress)

Grafana can be accessed at `https://grafana-${rootDomain}`, current default configuration requires github to be used as an authentication provider. Users will only be allowed to signup/signin if they are current members of `${githubOrg}`. 

##### Considerations:
The following modifications were made to ensure compatibility with the unchained stack as well as other monitoring stack components, if modifying this stack, be aware of these design decisions:
* Grafana also depends on cert-manager and traefik, if modifications to those CRDs are made, grafana could break
* Default grafana password generation happens on every pulumi run, we only want it to happen once so that we can bootstrap github auth.  A workaround for this issue is to add `env: { GF_SECURITY_DISABLE_INITIAL_ADMIN_CREATION: true }` to grafana helm values. 
* If you opt to not prevent Grafana from replacing its secret on every run, know that the first password created is the only one that will ever work while configured with a persistent volume


### Loki (Log Aggregator)
[Helm Chart](https://github.com/grafana/helm-charts/tree/main/charts/loki)

Loki is used to aggregate, index and query all logs shipped to it from promtail containers.  By default it is configured to use a persistent volume and store logs for a rolling two-week window. This specific Loki implementation has been designed with added Kubernetes insight, by using an event router to get kube API events, and by consuming systemd logs on all kubernetes nodes. 

##### Considerations:
* When getting log compaction and retention working I ran into a lot of strange behavior, modify the compaction values at your own risk.
* Needed to implement a [hacky fix](https://github.com/grafana/helm-charts/issues/609) in order to allow compaction to work. 

### Promtail (Log agent)
[Helm chart](https://github.com/grafana/helm-charts/tree/main/charts/promtail)

Promtail is paired with Loki to ship logs.

##### Considerations:
* Need to create a kube PriorityClass to ensure promtail daemonsets are scheduled to every node
* Pay close attention to resource utilization on these pods, can be overwhelmed in high traffic clusters at current configured resource requests. 

### Prometheus (Metrics)
[Helm Chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/prometheus)

Prometheus is used to aggregate and query time-series metrics, we employ various exporters to ensure data we care about is scraped. This component of our stack is under the most development at this point. 

##### Considerations: 
* Prometheus is currently running in a single instance configuration, eventually we would like to make this cluster highly available. 

### Alertmanager (Alerting)

Alert manager is the component that enables alert notifications to external services, it is currently packaged with the prometheus helm chart.

##### Considerations:
* Like prometheus, need to ensure this component is highly available, as well as put checks on this service itself

### Exporters
Exporters are used 

#### Node Exporter

This component is a daemonset that ships all node information to prometheus, it is currently packaged with the Prometheus helm chart.