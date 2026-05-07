output "documents_bucket" {
  value = aws_s3_bucket.documents.id
}

output "bedrock_agent_id" {
  value = aws_bedrockagent_agent.app.agent_id
}

output "bedrock_agent_alias_id" {
  value = aws_bedrockagent_agent_alias.app.agent_alias_id
}
