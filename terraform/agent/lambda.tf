data "archive_file" "agent_actions" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/agent-actions"
  output_path = "${path.module}/lambda/agent-actions.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.app_name}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name = "bedrock-s3-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:Converse"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      }
    ]
  })
}

resource "aws_lambda_function" "agent_actions" {
  filename         = data.archive_file.agent_actions.output_path
  source_code_hash = data.archive_file.agent_actions.output_base64sha256
  function_name    = "${var.app_name}-agent-actions"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 120

  environment {
    variables = {
      BEDROCK_MODEL_ID = var.bedrock_model_id
    }
  }
}

resource "aws_lambda_permission" "bedrock_agent" {
  statement_id   = "AllowBedrockAgentInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.agent_actions.function_name
  principal      = "bedrock.amazonaws.com"
  source_account = data.aws_caller_identity.current.account_id
}
