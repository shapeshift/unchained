# Tooling

## **Observability**

This section discusses the tools we use to gain insight in our cluster.


### **Loki**

We leverage Loki as our cluster-level logging solution.  Combined with the Promtail logging agent, and the Grafana dashboard, Loki completes our logging stack. 

* [Loki](https://grafana.com/docs/loki/latest/)
* [Promtail](https://grafana.com/docs/loki/latest/clients/promtail/)


#### **Persistent Storage**

In an effort to reduce cost, the default Loki configuration will leverage local pod storage instead of creating an EBS volume.  In this configuration logs can be lost at any time if the Loki pod is rescheduled.

By setting `logging.persistentVolume: true` a persistent volume will be created and mounted to the Loki pod.


#### **Log Retention**

A log retention policy can be configured by changing `logging.retentionPeriod`.  Unit is hour and the minimum retention time is 24 hours (`24h`).  If combining this feature with a persistent volume, ensure you have enough storage space setting `logging.pvSize` to a reasonable value. 


### **Grafana**

Grafana is the data visualization tool that we use to get insight from our observability tools.  


#### **How to Access**

Grafana's default authentication method leverages a secret that is deployed to Kubernetes, this is how to retrieve that secret and access the Grafana dashboard.


_Run these commands in the Kubernetes namespace where Grafana is deployed_

1. Get the admin password
```sh
kubectl get secret <grafana secret> -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

2. Forward grafana port to local machine
```sh
kubectl port-forward service/<grafana service> 8080:80
```

3. On your local machine, navigate to `localhost:8080`
```sh
admin / <password retrieved during step 1>
```
