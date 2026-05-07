variable "aws_region" {
  default = "eu-west-1"
}

variable "app_name" {
  default = "communities-bedrock"
}

# Model used by Lambda action groups for document analysis
variable "bedrock_model_id" {
  default = "eu.amazon.nova-lite-v1:0"
}

# Model used by the Bedrock Agent for orchestration (must support Agents in the region)
variable "bedrock_agent_model_id" {
  default = "anthropic.claude-3-haiku-20240307-v1:0"
}
