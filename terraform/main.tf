# Enable required APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# Bucket to store source code
resource "google_storage_bucket" "source_bucket" {
  name     = "${var.project_id}-source-code"
  location = var.region
  uniform_bucket_level_access = true
  depends_on = [google_project_service.services]
}

# Zip the source code
data "archive_file" "source_zip" {
  type        = "zip"
  source_dir  = "${path.module}/.."
  output_path = "${path.module}/source.zip"
  excludes    = [
    "node_modules",
    "terraform",
    ".git",
    ".env",
    "source.zip"
  ]
}

# Upload source code to GCS with a unique name to force a new build
resource "google_storage_bucket_object" "source_zip" {
  # Adding a timestamp to the name forces Cloud Run to recognize a change
  name   = "source-${data.archive_file.source_zip.output_md5}-${timestamp()}.zip"
  bucket = google_storage_bucket.source_bucket.name
  source = data.archive_file.source_zip.output_path
}

# Secret Manager for API Key
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "GEMINI_API_KEY"
  depends_on = [google_project_service.services]
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "gemini_api_key_v1" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = var.gemini_api_key
}

# Dedicated Service Account for Cloud Run
resource "google_service_account" "cloud_run_sa" {
  account_id   = "${var.service_name}-sa"
  display_name = "Service Account for ${var.service_name} Cloud Run"
  depends_on   = [google_project_service.services]
}

# Artifact Registry to store the built image
resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.service_name
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

# Get Project Number (needed for permissions)
data "google_project" "project" {}

# IAM: Allow Cloud Build to push to Artifact Registry
resource "google_artifact_registry_repository_iam_member" "build_pusher" {
  location   = google_artifact_registry_repository.repo.location
  repository = google_artifact_registry_repository.repo.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
}

# Trigger the build using gcloud (Force update when source zip changes)
resource "null_resource" "build_image" {
  triggers = {
    source_hash = data.archive_file.source_zip.output_md5
  }

  provisioner "local-exec" {
    command = "gcloud builds submit --pack image=${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/app:${data.archive_file.source_zip.output_md5} --project ${var.project_id} .."
  }

  depends_on = [
    google_artifact_registry_repository.repo,
    google_storage_bucket_object.source_zip,
    google_artifact_registry_repository_iam_member.build_pusher
  ]
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "default" {
  provider            = google-beta
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  # We remove the build_config block and rely on the null_resource build
  
  template {
    service_account = google_service_account.cloud_run_sa.email
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/app:${data.archive_file.source_zip.output_md5}"

      env {
        name  = "GOOGLE_GENAI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_version.gemini_api_key_v1,
    google_service_account.cloud_run_sa,
    null_resource.build_image
  ]
}

# IAM: Allow unauthenticated access
resource "google_cloud_run_v2_service_iam_member" "noauth" {
  provider = google-beta
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# IAM: Allow Cloud Run Service Account to access Secret Manager
resource "google_secret_manager_secret_iam_member" "cloud_run_secret_access" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Note: Cloud Run v2 default service account is generally [PROJECT_NUMBER]-compute@developer.gserviceaccount.com
# If you want to use a specific one, you should define it.
