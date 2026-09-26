data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name = "dispatchmate-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)

  services = {
    backend = { port = 8080, cpu = 1024, memory = 2048, public_port = null }
    ai-server = { port = 8001, cpu = 2048, memory = 4096, public_port = null }
    notification-server = { port = 3001, cpu = 512, memory = 1024, public_port = null }
    admin-web = { port = 80, cpu = 256, memory = 512, public_port = 80 }
    commander-tablet = { port = 80, cpu = 256, memory = 512, public_port = 8082 }
    responder-app = { port = 80, cpu = 256, memory = 512, public_port = 8083 }
  }
}

resource "aws_vpc" "main" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${count.index + 1}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  tags              = { Name = "${local.name}-private-${count.index + 1}" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  depends_on    = [aws_internet_gateway.main]
  tags          = { Name = local.name }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = aws_vpc.main.id

  dynamic "ingress" {
    for_each = toset([80, 8082, 8083])
    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = ["0.0.0.0/0"]
    }
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "tasks" {
  name   = "${local.name}-tasks"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }
  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "data" {
  name   = "${local.name}-data"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks.id]
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}
resource "random_password" "jwt" {
  length  = 64
  special = false
}
resource "random_password" "webhook" {
  length  = 48
  special = false
}
resource "random_password" "service" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "runtime" { name = "${local.name}/runtime" }
resource "aws_secretsmanager_secret_version" "runtime" {
  secret_id = aws_secretsmanager_secret.runtime.id
  secret_string = jsonencode({
    DB_PASSWORD            = random_password.db.result
    JWT_SECRET             = random_password.jwt.result
    INTERNAL_WEBHOOK_TOKEN = random_password.webhook.result
    INTERNAL_SERVICE_TOKEN = random_password.service.result
    AI_DATABASE_URL         = "postgresql://faind:${random_password.db.result}@${aws_db_instance.postgres.address}:5432/faind"
  })
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "postgres" {
  identifier             = local.name
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  max_allocated_storage  = 100
  storage_encrypted      = true
  db_name                = "faind"
  username               = "faind"
  password               = random_password.db.result
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.data.id]
  backup_retention_period = 7
  deletion_protection    = var.environment == "production"
  skip_final_snapshot    = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name}-final" : null
  multi_az               = var.environment == "production"
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "DispatchMate realtime cache"
  engine                     = "redis"
  node_type                  = "cache.t4g.micro"
  port                       = 6379
  num_cache_clusters         = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
}

resource "aws_ecr_repository" "service" {
  for_each             = local.services
  name                 = "dispatchmate/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_service_discovery_http_namespace" "main" {
  name = local.name
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 30
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.runtime.arn }] })
}

resource "aws_iam_role" "task" {
  name = "${local.name}-ecs-task"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}

resource "aws_lb" "main" {
  name               = substr(local.name, 0, 32)
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_lb_target_group" "frontend" {
  for_each    = { for key, service in local.services : key => service if service.public_port != null }
  name        = substr("${local.name}-${each.key}", 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id
  health_check {
    path    = "/"
    matcher = "200-399"
  }
}

resource "aws_lb_listener" "frontend" {
  for_each          = { for key, service in local.services : key => service if service.public_port != null }
  load_balancer_arn = aws_lb.main.arn
  port              = each.value.public_port
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend[each.key].arn
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = "${aws_ecr_repository.service[each.key].repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{ name = each.key, containerPort = each.value.port, protocol = "tcp", appProtocol = "http" }]
    environment = concat(
      [{ name = "OTEL_SERVICE_NAME", value = "dispatchmate-${each.key}" }],
      each.key == "backend" ? [
        { name = "DB_URL", value = "jdbc:postgresql://${aws_db_instance.postgres.address}:5432/faind" },
        { name = "DB_USERNAME", value = "faind" },
        { name = "REDIS_HOST", value = aws_elasticache_replication_group.redis.primary_endpoint_address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "SPRING_DATA_REDIS_SSL_ENABLED", value = "true" },
        { name = "AI_SERVER_BASE_URL", value = "http://ai-server:8001" },
        { name = "NOTIFICATION_SERVER_BASE_URL", value = "http://notification-server:3001" }
      ] : [],
      each.key == "ai-server" ? [
        { name = "FAIND_BACKEND_BASE_URL", value = "http://backend:8080" }
      ] : [],
      each.key == "notification-server" ? [
        { name = "DB_HOST", value = aws_db_instance.postgres.address },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_USERNAME", value = "faind" },
        { name = "DB_NAME", value = "faind" },
        { name = "BACKEND_BASE_URL", value = "http://backend:8080" }
      ] : []
    )
    secrets = contains(["backend", "ai-server", "notification-server"], each.key) ? concat(
      each.key != "ai-server" ? [
        { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:JWT_SECRET::" }
      ] : [],
      each.key != "ai-server" ? [
        { name = "DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:DB_PASSWORD::" }
      ] : [],
      each.key == "backend" ? [
        { name = "INTERNAL_WEBHOOK_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:INTERNAL_WEBHOOK_TOKEN::" },
        { name = "INTERNAL_SERVICE_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:INTERNAL_SERVICE_TOKEN::" }
      ] : [],
      each.key == "notification-server" ? [
        { name = "INTERNAL_WEBHOOK_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:INTERNAL_WEBHOOK_TOKEN::" }
      ] : [],
      each.key == "ai-server" ? [
        { name = "FAIND_BACKEND_SERVICE_TOKEN", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:INTERNAL_SERVICE_TOKEN::" },
        { name = "FAIND_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.runtime.arn}:AI_DATABASE_URL::" }
      ] : []
    ) : []
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.service[each.key].name, awslogs-region = var.aws_region, awslogs-stream-prefix = "ecs" } }
  }])
}

resource "aws_ecs_service" "service" {
  for_each        = var.deploy_services ? local.services : {}
  name            = "${local.name}-${each.key}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = false
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
    service {
      port_name      = each.key
      discovery_name = each.key
      client_alias {
        dns_name = each.key
        port     = each.value.port
      }
    }
  }

  dynamic "load_balancer" {
    for_each = each.value.public_port != null ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.frontend[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  depends_on = [aws_lb_listener.frontend, aws_iam_role_policy.secrets, aws_secretsmanager_secret_version.runtime]
}
