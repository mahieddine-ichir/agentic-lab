variable "aws_region" {
  default = "eu-west-1"
}

variable "app_name" {
  default = "communities-bedrock"
}

variable "bedrock_model_id" {
  default = "eu.amazon.nova-lite-v1:0"
}

variable "container_port" {
  default = 8080
}

variable "desired_count" {
  default = 1
}

# Optional — set after deploying terraform/agent to enable Bedrock Agent mode in the app
variable "documents_bucket" {
  default = ""
}

variable "bedrock_agent_id" {
  default = ""
}

variable "bedrock_agent_alias_id" {
  default = ""
}
