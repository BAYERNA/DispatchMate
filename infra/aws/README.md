# DispatchMate AWS deployment

Terraform provisions a two-AZ VPC, private Fargate tasks, an ALB, ECR repositories, PostgreSQL 16 on RDS,
Redis on ElastiCache, Secrets Manager, CloudWatch logs, ECS Service Connect discovery, and a KMS-encrypted
S3 analytics bucket. The three web
clients are exposed on ALB ports 80, 8082, and 8083; API, AI, and notification traffic remains private.

## Safe deployment order

1. Configure an encrypted remote Terraform state and AWS credentials.
2. Copy `terraform.tfvars.example` to an untracked `terraform.tfvars`.
3. Run `terraform init` and `terraform apply` with `deploy_services = false`.
4. Configure GitHub's `AWS_DEPLOY_ROLE_ARN` secret and `AWS_REGION` variable, then run the AWS deployment workflow.
5. Set `image_tag` to the pushed commit SHA, change `deploy_services = true`, and apply again.

## Validated analytics export

The `data-exporter` image runs `dbt build` first and uploads only the identifier-free
`analytics_marts.mart_daily_operations` aggregate when every data test passes. Each run writes a gzip CSV
and a SHA-256 manifest to the analytics bucket. The bucket blocks public access, requires TLS, uses a
customer-managed rotating KMS key, versions objects, transitions them to lower-cost storage, and expires
them after `analytics_retention_days`.

The EventBridge rule is deliberately created as `DISABLED`. After the deployment workflow has pushed the
same immutable `image_tag` referenced by Terraform, set `enable_data_exports = true` and apply again. The
default schedule is 03:00 KST daily. A failed dbt quality test exits before any object is uploaded; inspect
`/ecs/dispatchmate-<environment>/data-exporter` in CloudWatch Logs.

The default does not start ECS tasks, preventing a first apply from repeatedly pulling images that have not
been pushed yet. Production should add ACM certificates, Route 53 hostnames, AWS WAF, a dedicated NAT gateway
per AZ, and a separate encrypted S3/DynamoDB Terraform backend before carrying real operational data.

RDS, NAT Gateway, ALB, and Fargate generate AWS charges. Always inspect `terraform plan`, and use
`terraform destroy` for a disposable portfolio environment when the demonstration is complete.
