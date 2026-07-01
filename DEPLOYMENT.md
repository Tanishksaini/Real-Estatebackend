# Deployment & Setup Guide

This guide contains step-by-step instructions to set up **Google OAuth (Continue with Google)** and deploy your backend to **AWS** using the automated CI/CD pipeline.

---

## 1. Google OAuth Setup ("Continue with Google")

To verify Google Sign-In tokens on the backend, you need a Google Client ID:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Property-App`).
3. Search for **OAuth Consent Screen** in the search bar and configure it:
   - Select **External** (if you want any user to log in).
   - Fill in the App Name, User Support Email, and Developer Contact Info.
   - Click Save and Continue.
4. Go to **Credentials** -> **Create Credentials** -> **OAuth Client ID**.
   - Select **Web Application** as the Application Type.
   - Under **Authorized JavaScript Origins**, add your frontend URLs:
     - Local: `http://localhost:3000` or `http://localhost:5173` (depending on your frontend port)
     - Production: Your production frontend URL (e.g., `https://your-app.vercel.app`)
   - Under **Authorized Redirect URIs**, add the same URLs (if using frontend-only Google Sign-In, redirect URIs are not strictly required for the popup/button flow, but it's good practice to add them).
5. Click **Create** and copy the **Client ID** (it looks like `xxxxxx.apps.googleusercontent.com`).
6. Paste this Client ID in your backend `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your_actual_google_client_id_here
   ```

---

## 2. AWS Deployment Options

### Option A: AWS App Runner (Recommended & Fully Managed)
AWS App Runner is the easiest way to deploy containerized APIs. It automatically handles scaling, load balancing, and SSL.

#### Step 1: Create an ECR Repository
1. Open the [AWS Console](https://aws.amazon.com/) and go to **Elastic Container Registry (ECR)**.
2. Click **Create repository**.
3. Choose **Private**, name it `property-backend`, and click **Create repository**.
4. Copy the repository URI (e.g., `123456789012.dkr.ecr.ap-south-1.amazonaws.com/property-backend`).

#### Step 2: Create an IAM Role for App Runner
App Runner needs permission to pull images from ECR:
1. Go to **IAM** -> **Roles** -> **Create role**.
2. Select **AWS service** -> **App Runner**.
3. Under use case, select **App Runner** -> **App Runner ECR Access** (or search for policy `AWSAppRunnerServicePolicyForECRAccess`).
4. Name the role `AppRunnerECRAccessRole` and click **Create**.
5. Copy the **Role ARN** (e.g., `arn:aws:iam::123456789012:role/AppRunnerECRAccessRole`).

#### Step 3: Create App Runner Service
1. Go to **AWS App Runner** -> **Create service**.
2. Source: **Container registry** -> **Amazon ECR**.
3. Container image URI: Enter your ECR URI with `:latest` (e.g., `123456789012.dkr.ecr.ap-south-1.amazonaws.com/property-backend:latest`).
4. Deployment trigger: Select **Manual** (since our GitHub Actions pipeline will trigger the deployment).
5. ECR access role: Select the `AppRunnerECRAccessRole` you created.
6. Service name: `property-backend-service`.
7. Port: `4000`.
8. Under **Environment variables**, add your production env variables (e.g., `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, etc.).
9. Click **Create & Deploy**.

#### Step 4: Configure GitHub Secrets
In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret** and add:
- `AWS_ACCESS_KEY_ID`: Your AWS access key.
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret key.
- `AWS_APP_RUNNER_ROLE_ARN`: The ARN of the `AppRunnerECRAccessRole` (from Step 2).

---

### Option B: AWS EC2 (Budget-Friendly / Free Tier)
If you want to run on a free-tier `t2.micro` EC2 instance with PM2.

#### Step 1: Launch an EC2 Instance
1. Go to **EC2** -> **Launch Instance**.
2. Choose **Ubuntu Server 24.04 LTS**.
3. Instance Type: `t2.micro` (Free Tier eligible).
4. Key pair: Create and download a `.pem` file.
5. Under Network settings, allow **SSH**, **HTTP**, and **HTTPS**. Also, add a custom TCP rule for port `4000` (or whatever port your backend runs on) if not using a reverse proxy.

#### Step 2: Setup EC2 Instance
SSH into your instance and run:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 (Process Manager)
sudo npm install -y -g pm2

# Install Git
sudo apt install git -y
```

#### Step 3: Configure GitHub Secrets for EC2
If using the EC2 deployment method, add these secrets to GitHub:
- `EC2_HOST`: The public IP of your EC2 instance.
- `EC2_SSH_KEY`: The entire content of your downloaded `.pem` private key file.
