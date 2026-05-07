# Terraform Deployment to Google Cloud Run

This directory contains the Terraform configuration to deploy the Community Adhesion Pipeline to Google Cloud Run using a **source-based deployment** strategy.

## Prerequisites

1.  **Google Cloud SDK (`gcloud`)** installed and authenticated.
2.  **Terraform** (>= 1.5.0) installed.
3.  **zip** utility installed (required by Terraform to package the source).

## Steps

1.  **Initialize Terraform**:
    ```bash
    terraform init
    ```

2.  **Configure Variables**:
    Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in your details:
    ```bash
    cp terraform.tfvars.example terraform.tfvars
    ```
    - `project_id`: Your Google Cloud Project ID.
    - `gemini_api_key`: Your Google Gemini API key.

3.  **Review and Apply**:
    ```bash
    terraform plan
    terraform apply
    ```

## How it works

1.  **Packaging**: Terraform automatically zips your source code (excluding `node_modules`, `terraform`, etc.).
2.  **Storage**: The zip is uploaded to a private Google Cloud Storage bucket.
3.  **Build & Deploy**: Terraform instructs Cloud Run v2 to build and deploy your service directly from that zip using Google Cloud Buildpacks.
4.  **Secrets**: Your API key is stored securely in **Secret Manager** and injected into the Cloud Run service as the `GOOGLE_API_KEY` environment variable.
5.  **Access**: The service is made publicly accessible (`allUsers` with `roles/run.invoker`).
