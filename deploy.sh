#!/bin/bash

# Deploy to Google Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [SERVICE_NAME] [REGION]

PROJECT_ID=${1:-"your-project-id"}
SERVICE_NAME=${2:-"vault-krate-balancer"}
REGION=${3:-"us-central1"}

echo "Deploying to Google Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"

# Build and deploy
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10

echo "Deployment complete!"
echo "Service URL:"
gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format "value(status.url)"