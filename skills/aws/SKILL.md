---
name: aws
description: >-
  Drive AWS with the aws CLI. Use when inspecting or changing AWS resources —
  S3, EC2, Lambda, IAM, CloudFormation, Route 53, DynamoDB — or when a task
  names an AWS service, ARN, stack, or region.
---

# AWS CLI

Every AWS API is one `aws <service> <operation>` call away. Compose CLI calls
instead of writing SDK scripts unless the task genuinely needs code.

## Steps

1. Anchor identity and region before touching anything:
   `AWS_PAGER="" aws sts get-caller-identity --output json`
   Done when the returned account and ARN match the intended environment.
2. Discover the exact operation and its required parameters:
   `aws <service> help`, then `aws <service> <operation> help`
   (e.g. `aws s3api help`, `aws s3api list-objects-v2 help`).
   Done when you can name every required flag from the help text.
3. Read first, mutate second. Keep reads small with `--output json` and a
   JMESPath `--query`:
   ```sh
   AWS_PAGER="" aws ec2 describe-instances --region us-east-1 \
     --filters Name=instance-state-name,Values=running \
     --output json \
     --query 'Reservations[].Instances[].{id:InstanceId,state:State.Name}'
   ```
4. Mutate only after a read confirms the target resource exists as expected,
   passing the same `--region` used for the read.
5. When API behaviour is unclear, fetch the official docs from
   `https://docs.aws.amazon.com` for the service and operation.

## Reference

- Always set `AWS_PAGER=""` (or pass `--no-cli-pager`): a pager blocks
  non-interactive runs.
- `--output json --query '<JMESPath>'` is the default shape for any call whose
  output a later step must consume; `--output text` suits shell loops.
- Auth rides the standard credential chain: `~/.aws/credentials` with
  `AWS_PROFILE`, plain `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  (+`AWS_SESSION_TOKEN` for temporary creds), or SSO (`aws sso login` once,
  then cached).
- Region resolution: per-call `--region` wins, then `AWS_REGION` /
  `AWS_DEFAULT_REGION`. A missing region is the most common single failure —
  pass it explicitly when a call behaves oddly.
- Pass `--no-cli-auto-prompt` if a shell wrapper ever turns a call into an
  interactive prompt.
- Long-form docs for an operation are in the help page; parameter semantics,
  limits, and error codes live in the online docs, not the CLI.
