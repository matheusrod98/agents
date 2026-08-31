---
name: kubernetes
description: Inspect and change Kubernetes clusters with kubectl. Use when listing or describing workloads, reading pod logs, execing into containers, applying manifests, watching rollouts, or discovering resource types in any kubeconfig context.
---

# Kubernetes via kubectl

kubectl talks to the same API servers the removed MCP wrapped — no adapter sits
in between. Start from built-in discovery:

```sh
kubectl api-resources          # every resource type and its verbs
kubectl config get-contexts    # clusters = kubeconfig contexts
```

## Steps

1. Read state: `kubectl get <resource> -n <namespace> -o json`; use
   `-o yaml`, `-o jsonpath=...`, or `-o go-template=...` when JSON is the wrong
   shape. `kubectl describe` adds events and conditions.
   Done when the resource's status matches the question being asked.
2. Debug pods: `kubectl logs deploy/my-app -n prod --tail=200` (`-f` to
   follow, `-c <container>` for multi-container pods),
   `kubectl exec -it <pod> -- sh`, `kubectl top pods -n prod`.
3. Change state: `kubectl apply -f manifest.yaml`, then confirm with
   `kubectl rollout status deployment/<name> -n prod`. Prefer apply over
   imperative `create`/`edit` so manifests stay reviewable in git.
4. Switch clusters with `--context <name>` or `KUBECONFIG=<file>`; multi
   cluster was kubeconfig contexts in the old setup too.

## Reference

- Pass `-o json` (or jsonpath) on every get for machine-readable output; the
  human-oriented table format is the exception.
- Auth is whatever the kubeconfig encodes — bearer tokens, exec plugins,
  client certs. There is no separate login step.
- `helm` is not installed. When a task needs charts, add `kubernetes-helm` in
  `~/.dotfiles` first, then use `helm install/list/uninstall -o json`.
- `kubectl -n <ns>` beats `-A` for large clusters; use `-A` when hunting
  across namespaces is the point.
