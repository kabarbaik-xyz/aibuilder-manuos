# ManuOS Cloud Run Deployment & Operations Runbook

This document details the configuration, deployment, and rollback procedures for deploying ManuOS to Google Cloud Run with Google Secret Manager.

---

## 1. Prerequisites & GCP Setup

1. **Google Cloud SDK (`gcloud`)** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud config set project <YOUR_GCP_PROJECT_ID>
   ```

2. **Required GCP APIs:**
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     secretmanager.googleapis.com \
     cloudbuild.googleapis.com
   ```

3. **Artifact Registry Repository:**
   ```bash
   gcloud artifacts repositories create <YOUR_REPO_NAME> \
     --repository-format=docker \
     --location=<YOUR_REGION> \
     --description="Docker repository for ManuOS container images"
   ```

---

## 2. Google Secret Manager Configuration

ManuOS requires `GEMINI_API_KEY` strictly on the server side. Never expose this key in client-side bundles or `NEXT_PUBLIC_` variables.

1. **Create the Secret in Secret Manager:**
   ```bash
   echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create <YOUR_GEMINI_SECRET_NAME> \
     --data-file=- \
     --replication-policy="automatic"
   ```

2. **Grant Secret Access to Cloud Run Service Account:**
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')

   gcloud secrets add-iam-policy-binding <YOUR_GEMINI_SECRET_NAME> \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```

---

## 3. Container Build & Push

Build the multi-stage standalone container using Google Cloud Build or local Docker:

### Option A: Using Google Cloud Build (Recommended)
```bash
gcloud builds submit \
  --tag <YOUR_REGION>-docker.pkg.dev/$(gcloud config get-value project)/<YOUR_REPO_NAME>/manuos-web:v1.0.0 .
```

### Option B: Local Docker Build & Push
```bash
# Authenticate Docker to Artifact Registry
gcloud auth configure-docker <YOUR_REGION>-docker.pkg.dev

# Build image
docker build -t <YOUR_REGION>-docker.pkg.dev/$(gcloud config get-value project)/<YOUR_REPO_NAME>/manuos-web:v1.0.0 .

# Test locally on port 8080
docker run -p 8080:8080 \
  -e GEMINI_API_KEY="test_key" \
  <YOUR_REGION>-docker.pkg.dev/$(gcloud config get-value project)/<YOUR_REPO_NAME>/manuos-web:v1.0.0

# Push to Artifact Registry
docker push <YOUR_REGION>-docker.pkg.dev/$(gcloud config get-value project)/<YOUR_REPO_NAME>/manuos-web:v1.0.0
```

---

## 4. Deploy to Google Cloud Run

Deploy with recommended demo specifications (1 vCPU, 1 GB RAM, min-instances 1 to eliminate cold starts):

```bash
gcloud run deploy <YOUR_SERVICE_NAME> \
  --image <YOUR_REGION>-docker.pkg.dev/$(gcloud config get-value project)/<YOUR_REPO_NAME>/manuos-web:v1.0.0 \
  --region <YOUR_REGION> \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1024Mi \
  --min-instances 1 \
  --max-instances 5 \
  --set-env-vars NODE_ENV=production,GEMINI_FLASH_MODEL=gemini-2.5-flash \
  --set-secrets GEMINI_API_KEY=<YOUR_GEMINI_SECRET_NAME>:latest
```

---

## 5. Verification & Smoke Testing

Once deployment completes, Cloud Run will output a service URL (e.g., `https://<YOUR_SERVICE_URL>`).

1. **Verify Health Check Endpoint:**
   ```bash
   curl -s https://<YOUR_SERVICE_URL>/api/health
   # Expected output:
   # {"status":"ok","timestamp":"...","service":"manuos-web","version":"1.0.0"}
   ```

2. **Verify AI Grounding Endpoint:**
   ```bash
   curl -s -X POST https://<YOUR_SERVICE_URL>/api/ai/brain-qa \
     -H "Content-Type: application/json" \
     -d '{"question":"What is delaying order 088?","snapshot":{}}'
   ```

3. **Verify Passport URL:**
   Open `https://<YOUR_SERVICE_URL>/passports/SN-1042-078` in a browser.

---

## 6. Rollback & Scaling Down

### Immediate Rollback to Previous Revision
```bash
# List revisions
gcloud run revisions list --service <YOUR_SERVICE_NAME> --region <YOUR_REGION>

# Route 100% traffic to previous stable revision
gcloud run services update-traffic <YOUR_SERVICE_NAME> \
  --region <YOUR_REGION> \
  --to-revisions <PREVIOUS_REVISION_NAME>=100
```

### Scale Down Post-Demo (To Avoid Costs)
```bash
gcloud run services update <YOUR_SERVICE_NAME> \
  --region <YOUR_REGION> \
  --min-instances 0
```

---

## Public Prototype

The live demo is available at: **https://manuos-web-111572702355.us-central1.run.app**