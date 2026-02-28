# Deployment Guide for Cloudflare + KV Setup

## Step 1: Preparation

1. **Create a KV Namespace:**
   - Log in to the Cloudflare Dashboard → Storage & Databases → Workers KV.
   - Create a new namespace, e.g., name it `V2r_DATA`.

2. **Set Environment Variables:**
   - In your project settings, add the following environment variables:
     - `AUTH_USER`: Set your login username.
     - `AUTH_PASS`: Set your login password.
     - `SUB_TOKEN`: Your subscription key (e.g., secret888).

---

## Step 3: CF Deployment

1. **Upload Code:**
   - CF Pages: Fork my repository to your GitHub, then import this GitHub repository into CF Pages.
   - CF Workers: Create a new CF Worker starting with "Hello World!", then replace the Worker code with the code from _worker.js.

2. **Bind KV Namespace (Critical):**
   - Go to your project → Settings → bindings.
   - Find the KV namespace bindings section.
   - Click "Add Binding":
     - Variable name must be: `V2_DATA`
     - Select the KV namespace you created earlier.

3. **Redeploy:**
   - After binding the KV, trigger a redeployment so the changes take effect.

4. **Access the Page:**
   - Open your Pages domain (e.g., `xxx.pages.dev`).
   - Enter the username and password you set in the environment variables to log in.
   - Paste your node list and click **Save**.
   - Click **Copy Subscription Link** and paste it into OpenClash under:
     - *Configuration Management* → *Add Subscription URL*.

---

## Script Highlights

1. **Automatic Domain Detection:**  
   Whether you use the default `pages.dev` domain or a custom domain, the script automatically generates the correct subscription link.

2. **Persistent Storage:**  
   Using Cloudflare KV ensures that your previously edited node list is saved even if the Pages app is redeployed.

3. **Duplicate Name Handling:**  
   Built-in duplicate node detection automatically appends `_1`, `_2` suffixes to prevent OpenClash startup failures.

4. **OpenClash Optimization:**  
   The generated YAML includes `external-controller: 0.0.0.0:9090`, ensuring the control panel can be accessed directly.

5. **Enhanced Security：**
   The environment variable `SUB_TOKEN` is applied to the subscription link. You can also customize the subscription path by modifying `/scfg` in the following:

```javascript
// 1. Define your custom path here  
const mySubPath = "/scfg";
```

## Tip

Cloudflare KV offers a very generous free tier, making this solution virtually **zero-cost** and suitable for **permanent operation**.
