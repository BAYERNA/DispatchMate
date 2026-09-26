output "ecr_repository_urls" {
  value = { for key, repository in aws_ecr_repository.service : key => repository.repository_url }
}

output "frontend_urls" {
  value = {
    admin     = "http://${aws_lb.main.dns_name}"
    commander = "http://${aws_lb.main.dns_name}:8082"
    responder = "http://${aws_lb.main.dns_name}:8083"
  }
}

output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "runtime_secret_arn" { value = aws_secretsmanager_secret.runtime.arn }
output "analytics_bucket_name" { value = aws_s3_bucket.analytics.id }
output "analytics_kms_key_arn" { value = aws_kms_key.analytics.arn }
output "data_export_task_definition_arn" { value = aws_ecs_task_definition.data_exporter.arn }
output "data_exporter_ecr_repository_url" { value = aws_ecr_repository.data_exporter.repository_url }
