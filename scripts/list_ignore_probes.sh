#!/bin/bash

namespaces=("unchained-dev" "unchained")

for ns in "${namespaces[@]}"; do
	statefulsets=$(kubectl get statefulsets -n $ns -o jsonpath='{.items[*].metadata.name}')

	for ss in $statefulsets; do
	    label_selector=$(kubectl get statefulset $ss -n $ns -o jsonpath='{.spec.selector.matchLabels}' | jq -r 'to_entries | map("\(.key)=\(.value|tostring)") | join(",")')

	    # Get the names of all pods with the matching label selector
	    pods=$(kubectl get pods -n $ns -l $label_selector -o jsonpath='{.items[*].metadata.name}')

	    # Loop through each pod
	    for pod in $pods; do
	        # Get the names of all containers in the current pod
	        containers=$(kubectl get pod $pod -n $ns -o jsonpath='{.spec.containers[*].name}')

	        # Loop through each container in the current pod
	        for container in $containers; do
				echo "checking $ns/$pod/$container"
	            files=$(kubectl exec -it $pod -n $ns -c $container -- find /data -type f -name "disable_*" 2>/dev/null)
				if [[ "$files" && ! $files =~ "No such file or directory" ]]; then
					echo "found $ns/$pod/$container: $files"
				fi

	            files=$(kubectl exec -it $pod -n $ns -c $container -- find /root -type f -name "disable_*" 2>/dev/null)
				if [[ "$files" && ! $files =~ "No such file or directory" ]]; then
					echo "found $ns/$pod/$container: $files"
				fi
	        done
	    done
	done
done