variable "project_id" {
  type        = string
  description = "The Google Cloud Project ID"
}

variable "region" {
  type        = string
  description = "The Google Cloud region to deploy to"
  default     = "europe-west9"
}

variable "service_name" {
  type        = string
  description = "The name of the Cloud Run service"
  default     = "communities-gcp-agents"
}

variable "gemini_api_key" {
  type        = string
  description = "The Google Gemini API Key"
  sensitive   = true
}
