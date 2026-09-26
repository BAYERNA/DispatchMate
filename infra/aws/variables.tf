variable "aws_region" {
  description = "AWS region used for all resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "portfolio"
}

variable "image_tag" {
  description = "Immutable image tag pushed by GitHub Actions (normally a commit SHA)."
  type        = string
  default     = "latest"
}

variable "deploy_services" {
  description = "Create ECS services after images are available in ECR."
  type        = bool
  default     = false
}

variable "desired_count" {
  description = "Desired task count for each application service."
  type        = number
  default     = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "enable_data_exports" {
  description = "Enable the scheduled dbt quality gate and S3 aggregate export. Disabled until the image exists."
  type        = bool
  default     = false
}

variable "analytics_export_schedule" {
  description = "EventBridge schedule in UTC; the default is 03:00 KST."
  type        = string
  default     = "cron(0 18 * * ? *)"
}

variable "analytics_export_lookback_days" {
  type    = number
  default = 7
  validation {
    condition     = var.analytics_export_lookback_days >= 1 && var.analytics_export_lookback_days <= 366
    error_message = "analytics_export_lookback_days must be between 1 and 366."
  }
}

variable "analytics_retention_days" {
  type    = number
  default = 365
  validation {
    condition     = var.analytics_retention_days > 90
    error_message = "analytics_retention_days must be greater than the 90-day Glacier transition."
  }
}
