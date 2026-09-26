resource "aws_kms_key" "analytics" {
  description             = "DispatchMate analytics export encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "analytics" {
  name          = "alias/${local.name}-analytics"
  target_key_id = aws_kms_key.analytics.key_id
}

resource "aws_s3_bucket" "analytics" {
  bucket = "${local.name}-analytics-${data.aws_caller_identity.current.account_id}"
  tags   = { Name = "${local.name}-analytics", DataClassification = "internal-aggregate" }
}

resource "aws_s3_bucket_public_access_block" "analytics" {
  bucket                  = aws_s3_bucket.analytics.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_versioning" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.analytics.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  rule {
    id     = "analytics-retention"
    status = "Enabled"
    filter { prefix = "analytics/" }
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration { days = var.analytics_retention_days }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

data "aws_iam_policy_document" "analytics_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.analytics.arn, "${aws_s3_bucket.analytics.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "analytics" {
  bucket = aws_s3_bucket.analytics.id
  policy = data.aws_iam_policy_document.analytics_bucket.json
}

resource "aws_ecr_repository" "data_exporter" {
  name                 = "dispatchmate/data-exporter"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_cloudwatch_log_group" "data_exporter" {
  name              = "/ecs/${local.name}/data-exporter"
  retention_in_days = 30
}

resource "aws_iam_role" "data_exporter_task" {
  name = "${local.name}-data-exporter-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "data_exporter" {
  role = aws_iam_role.data_exporter_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:AbortMultipartUpload"]
        Resource = "${aws_s3_bucket.analytics.arn}/analytics/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.analytics.arn
      }
    ]
  })
}

resource "aws_ecs_task_definition" "data_exporter" {
  family                   = "${local.name}-data-exporter"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.data_exporter_task.arn

  container_definitions = jsonencode([{
    name      = "data-exporter"
    image     = "${aws_ecr_repository.data_exporter.repository_url}:${var.image_tag}"
    essential = true
    environment = [
      { name = "DB_HOST", value = aws_db_instance.postgres.address },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_USERNAME", value = "faind" },
      { name = "DB_NAME", value = "faind" },
      { name = "DB_SSLMODE", value = "require" },
      { name = "EXPORT_BUCKET", value = aws_s3_bucket.analytics.id },
      { name = "EXPORT_KMS_KEY_ID", value = aws_kms_key.analytics.arn },
      { name = "EXPORT_PREFIX", value = "analytics/daily-operations" },
      { name = "EXPORT_LOOKBACK_DAYS", value = tostring(var.analytics_export_lookback_days) }
    ]
    secrets = [
      { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:DB_PASSWORD::" },
      { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:AI_DATABASE_URL::" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.data_exporter.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "pipeline"
      }
    }
  }])

  depends_on = [aws_iam_role_policy.secrets, aws_iam_role_policy.data_exporter]
}

resource "aws_iam_role" "eventbridge_data_export" {
  name = "${local.name}-data-export"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_data_export" {
  role = aws_iam_role.eventbridge_data_export.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = aws_ecs_task_definition.data_exporter.arn
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.execution.arn, aws_iam_role.data_exporter_task.arn]
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "data_export" {
  name                = "${local.name}-data-export"
  description         = "Build validated analytics marts and export privacy-safe aggregates"
  schedule_expression = var.analytics_export_schedule
  state               = var.enable_data_exports ? "ENABLED" : "DISABLED"
}

resource "aws_cloudwatch_event_target" "data_export" {
  rule     = aws_cloudwatch_event_rule.data_export.name
  arn      = aws_ecs_cluster.main.arn
  role_arn = aws_iam_role.eventbridge_data_export.arn

  ecs_target {
    task_definition_arn = aws_ecs_task_definition.data_exporter.arn
    task_count          = 1
    launch_type         = "FARGATE"
    platform_version    = "LATEST"
    network_configuration {
      subnets          = aws_subnet.private[*].id
      security_groups  = [aws_security_group.tasks.id]
      assign_public_ip = false
    }
  }
}
