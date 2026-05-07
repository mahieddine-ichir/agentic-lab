data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "documents" {
  bucket        = "${var.app_name}-docs-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "expire-uploads"
    status = "Enabled"
    expiration { days = 1 }
  }
}
