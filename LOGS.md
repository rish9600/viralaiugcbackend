# Monitoring Logs

## 1. Direct Pod Logs (Simplest Method)

For basic log viewing:

```bash
# Follow logs from all pods in the deployment
kubectl logs -f deployment/remotion-video-generator -n remotion

# View logs from a specific pod
kubectl get pods -n remotion
kubectl logs -f pod-name-xyz -n remotion
```

This is good for quick debugging but doesn't persist logs if pods restart.

## 2. Deploy a Log Dashboard with Digital Ocean Monitoring

Digital Ocean's built-in monitoring can be enabled for your Kubernetes cluster:

1. Go to your Kubernetes cluster in the Digital Ocean dashboard
2. Click on "Insights" tab
3. Enable "Monitoring" if not already enabled
4. Access the Kubernetes dashboard to view logs and metrics

This provides a simple dashboard with basic log viewing capabilities.

## 3. Set Up Centralized Logging with EFK Stack

For a more robust logging solution, you can deploy the EFK (Elasticsearch, Fluentd, Kibana) stack:

```bash
# Add the Elastic Helm repository
helm repo add elastic https://helm.elastic.co
helm repo update

# Create a namespace for logging
kubectl create namespace logging

# Install Elasticsearch
helm install elasticsearch elastic/elasticsearch --namespace logging

# Install Fluentd to collect logs
kubectl apply -f https://raw.githubusercontent.com/fluent/fluentd-kubernetes-daemonset/master/fluentd-daemonset-elasticsearch-rbac.yaml

# Install Kibana for log visualization
helm install kibana elastic/kibana --namespace logging
```

Then access Kibana by port-forwarding:

```bash
kubectl port-forward svc/kibana-kibana 5601:5601 -n logging
```

Visit http://localhost:5601 in your browser to access the Kibana dashboard.

## 4. Use Managed Logging Service (Recommended for Production)

For a professional, zero-maintenance solution:

1. **Papertrail**:

   ```bash
   # Create a Kubernetes Secret with your Papertrail host and port
   kubectl create secret generic papertrail-destination --from-literal=host=logsX.papertrailapp.com --from-literal=port=XXXXX -n remotion

   # Deploy the Papertrail log forwarder
   kubectl apply -f https://github.com/papertrail/papertrail-kubernetes/raw/master/papertrail.yml -n remotion
   ```

2. **Datadog**:

   ```bash
   # Add Datadog Helm repository
   helm repo add datadog https://helm.datadoghq.com
   helm repo update

   # Install Datadog with API key
   helm install datadog --set datadog.apiKey=YOUR_API_KEY datadog/datadog
   ```

3. **New Relic**:

   ```bash
   # Add New Relic Helm repository
   helm repo add newrelic https://helm-charts.newrelic.com
   helm repo update

   # Install New Relic with license key
   helm install newrelic-bundle newrelic/nri-bundle \
     --set global.licenseKey=YOUR_LICENSE_KEY \
     --set global.cluster=remotion-cluster
   ```

## 5. Add Log Forwarding to Your Deployment

You can modify your application to forward logs to an external service:

```yaml
# Add to your deployment.yaml under containers
- name: fluent-bit
  image: fluent/fluent-bit:1.9
  volumeMounts:
  - name: log-volume
    mountPath: /var/log
  - name: fluent-bit-config
    mountPath: /fluent-bit/etc/
volumes:
- name: log-volume
  emptyDir: {}
- name: fluent-bit-config
  configMap:
    name: fluent-bit-config
```

Then create a ConfigMap with Fluent Bit configuration pointing to your log service.

## 6. Use Digital Ocean Managed Database for Audit Logs

If you want to store logs for compliance or auditing:

1. Create a Digital Ocean Managed Postgres Database
2. Add a logging middleware to your application that writes important events to this database
3. Create a simple dashboard to query these logs

## Setting Up Log Alerts

For any of these solutions, you can set up alerts for critical events:

```bash
# Example: Set up alert for pod restarts or failures using kubectl
kubectl create -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: remotion-alerts
  namespace: monitoring
spec:
  groups:
  - name: remotion
    rules:
    - alert: PodRestartingFrequently
      expr: increase(kube_pod_container_status_restarts_total{namespace="remotion"}[1h]) > 5
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Pod is restarting frequently"
        description: "Pod {{$labels.pod}} in namespace {{$labels.namespace}} is restarting frequently"
EOF
```

For your Remotion video generator, I recommend starting with the basic kubectl logs for development, and then implementing either the EFK stack or a managed logging service like Papertrail or Datadog for production use. This will give you both real-time log visibility and historical log analysis capabilities.
