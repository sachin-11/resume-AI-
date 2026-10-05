# Docker + Kubernetes @ High Scale — is project ke liye

> Ye ek self-contained reference hai: Docker basics → is repo ko containerize karna → Kubernetes pe deploy karna → high-scale pe jo cheezein **isi codebase mein** silently toot jaati hain unka fix. Sab kuch ek hi file mein hai jaisa maanga tha.

**Current setup (baseline, samajhna zaroori hai pehle):**
- `Next.js app` → AWS Amplify pe deploy hota hai (`amplify.yml` dekho — build ke baad `prisma migrate deploy` chalta hai)
- `agent-service` (Python/FastAPI/LangGraph) → Railway/Render pe deploy hota hai (`Procfile`: `uvicorn main:app --host 0.0.0.0 --port $PORT`, already has `/health`)
- DB → Postgres (Neon/RDS), Prisma se connect
- External: Groq/OpenAI (LLM), Pinecone (vector DB), S3 (audio), SMTP, Stripe, Langfuse

Dono services **already stateless HTTP servers** hain — yehi property Docker/K8s migration ko easy banati hai. Lekin neeche section 4 mein 3 jagah hain jahan "stateless" ka assumption **false** hai (in-memory state), aur wahi cheezein multi-pod scale pe silently break karengi. Wo sabse important part hai is guide ka — read that even if you skip everything else.

---

## 1. Docker — fundamentals (30-second recap)

- **Image** = frozen filesystem snapshot + start command (build-time artifact, immutable)
- **Container** = running instance of an image (runtime)
- **Layers** = har `Dockerfile` instruction ek layer banata hai, cache hota hai — isliye order matters (rarely-changing cheez upar, frequently-changing niche)
- **Multi-stage build** = ek stage mein compile/build karo (heavy toolchain), doosre stage mein sirf output copy karo (lightweight runtime image) — final image chhota rehta hai

---

## 2. Dockerizing this repo

### 2a. `Dockerfile` — Next.js app (root)

Pehle `next.config.ts` mein ye add karo (isके bina standalone output nahi banega):

```ts
const nextConfig: NextConfig = {
  output: "standalone",   // <-- add karo
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // ...baaki same
};
```

```dockerfile
# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client generate build ke andar hi karna hoga (schema copy ho chuka hai)
RUN npx prisma generate
RUN npm run build

# ── Stage 3: runtime (chhota, sirf jo chahiye) ───────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
# migrate deploy container start pe (Amplify ki postBuild step ka equivalent)
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
```

`.dockerignore` (bahut zaroori — warna `node_modules`, `.env`, `.next` sab context mein chale jaayenge):

```
node_modules
.next
.env*
.git
agent-service
IMPROVEMENTS_TODO.md
*.md
```

### 2b. `Dockerfile` — agent-service (Python)

```dockerfile
FROM python:3.11-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2c. `docker-compose.yml` — local dev (root, dono services + DB ek command mein)

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_resume_coach
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  web:
    build: { context: ., dockerfile: Dockerfile }
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/ai_resume_coach
      AGENT_SERVICE_URL: http://agent-service:8000
      # baaki secrets .env se — docker-compose --env-file .env
    depends_on: [postgres]

  agent-service:
    build: { context: ./agent-service }
    ports: ["8000:8000"]
    depends_on: [postgres]

volumes:
  pgdata:
```

Run: `docker compose up --build`

---

## 3. Kubernetes — concepts recap (jo isi guide mein use honge)

| Object | Kaam |
|---|---|
| **Pod** | Ek ya zyada containers ka smallest deployable unit |
| **Deployment** | N replicas of a Pod maintain karta hai, rolling updates handle karta hai |
| **Service** | Pods ke aage stable network identity/load-balancing (`ClusterIP`, internal traffic ke liye) |
| **Ingress** | External HTTP traffic ko Services tak route karta hai (TLS termination bhi yahin) |
| **ConfigMap** | Non-secret config (feature flags, URLs) |
| **Secret** | API keys, DB URL — base64-encoded, ideally external secret manager se synced |
| **HPA** | Horizontal Pod Autoscaler — metric ke basis pe replica count badhata/ghatata hai |
| **readinessProbe / livenessProbe** | K8s ko batata hai pod traffic lene ke liye ready hai ya nahi, aur crashed hai ya nahi |

---

## 4. High-scale manifests — **is project ke gotchas ke saath**

### 4a. Web app Deployment + Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector: { matchLabels: { app: web } }
  strategy:
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # zero-downtime
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: <registry>/ai-resume-coach-web:<tag>
          ports: [{ containerPort: 3000 }]
          envFrom:
            - configMapRef: { name: web-config }
            - secretRef: { name: web-secrets }
          resources:
            requests: { cpu: "250m", memory: "256Mi" }
            limits:   { cpu: "1",    memory: "512Mi" }
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 15
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata: { name: web }
spec:
  selector: { app: web }
  ports: [{ port: 80, targetPort: 3000 }]
```

⚠️ **`/api/health` abhi is repo mein exist nahi karta** — add karna padega before this works:

```ts
// app/api/health/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "db_unreachable" }, { status: 503 });
  }
}
```

### 4b. agent-service Deployment + Service

Same pattern, `image: <registry>/agent-service:<tag>`, port `8000`, probe path `/health` (ye already exists in `agent-service/main.py`).

### 4c. HPA — dono ke liye

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web-hpa }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: web }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 } }
```

⚠️ **CPU-based HPA is naive for this workload.** Interview/feedback routes ka latency AI-provider-bound hai (Groq/OpenAI round-trip, up to 90s with fallback chain — jaisa `lib/groq.ts` mein hai), CPU nahi. Ek pod 50 concurrent requests hold kar sakta hai bina CPU spike ke (sab I/O wait mein hain), lekin memory/connections saturate ho jaayenge. Better: `type: Pods` custom metric on **in-flight request count**, ya KEDA se queue-depth-based scaling agar AI calls ko queue kiya (see 4f).

### 4d. Secrets — env vars ko K8s Secret mein

```yaml
apiVersion: v1
kind: Secret
metadata: { name: web-secrets }
type: Opaque
stringData:
  DATABASE_URL: "postgresql://...neon.tech/neondb?sslmode=require"
  GROQ_API_KEY: "..."
  OPENAI_API_KEY: "..."
  STRIPE_SECRET_KEY: "..."
  NEXTAUTH_SECRET: "..."
  # baaki jo next.config.ts ke `env` block mein list hain
```

Production mein plain `Secret` bas base64 hai, encryption-at-rest nahi guarantee karta by default. High-scale/compliance-conscious setup mein **External Secrets Operator** use karo AWS Secrets Manager/Vault ke saath sync karne ke liye, taaki keys cluster manifest mein kabhi commit na hon.

### 4e. Ingress (TLS + routing)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: main-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [app.example.com]
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
```

`agent-service` ko internally hi expose rakho (`AGENT_SERVICE_URL: http://agent-service:8000` cluster-internal DNS) — publicly expose karne ki zaroorat nahi, sirf `web` usse call karta hai server-side.

### 4f. 🔴 In-memory state — ye 3 cheezein multi-pod pe silently toot jaayengi

Ye is guide ka sabse important section hai. Single-instance (Amplify/Render single dyno) pe ye theek chal rahe hain kyunki ek hi process hai. **Jaise hi `replicas: 3+` karoge, in teeno mein se koi bhi Pod-specific ho jaata hai — global nahi rehta:**

1. **`lib/rate-limit.ts`** — `const store = new Map<string, RateLimitEntry>()`, per-process in-memory. 3 pods = same IP effectively 3x rate limit paa sakta hai (round-robin LB ke through), kyunki har pod ka apna alag counter hai.
   **Fix**: Redis-backed rate limiter (`ioredis` + sorted set/`INCR`+`EXPIRE`), ya managed edge rate-limiting (Cloudflare/API Gateway) LB ke upstream pe.

2. **`lib/groq.ts`** — `groqUnavailableUntil` aur `lastAlertSentAt` module-level variables hain. Multi-pod mein: (a) ek pod Groq rate-limit khaata hai aur OpenAI pe switch karta hai, baaki pods ko pata hi nahi chalta — wo Groq try karte rehte hain (harm nahi, bas circuit-breaker ka fayda nahi milta cluster-wide); (b) `sendSwitchAlert`'s 1-hour cooldown per-pod hai, so N pods = N alert emails within the same hour instead of 1.
   **Fix**: Cooldown state ko Redis mein rakho (`SET groq:cooldown_until <ts> EX <ttl>`), ya accept karo ki ye per-pod hai (harmless bas noisy) aur alert ko ek separate lightweight cron/webhook se bhejo instead of from request path.

3. **`lib/db.ts`** — Prisma client `connection_limit=5` per instance set karta hai (comment khud kehta hai "safe for Neon free tier"). N pods × 5 = N×5 concurrent DB connections. 10 pods = 50 connections, jo Neon free tier/small Postgres instance ki limit se easily upar chala jaayega.
   **Fix**: Naye scale pe `connection_limit` ko `total_budget / replica_count` formula se set karo (env var se inject, hardcode mat karo), aur Neon ka **pooled connection string** (`-pooler` suffix, PgBouncer transaction mode) use karo jo already `.env` mein comment-out hai — usko primary bana do jab replicas > 1.

**Common thread**: horizontal scaling ka pehla assumption hi ye hai ki koi bhi Pod kabhi bhi kill/restart/replace ho sakta hai aur koi bhi request kisi bhi Pod pe jaa sakti hai. Jo bhi state "isi request ko yaad rehna chahiye agli baar" iss assumption ko todta hai, wo shared store (Redis/DB) mein jaana chahiye, process memory mein nahi.

---

## 5. CI/CD — image build → registry → cluster

```yaml
# .github/workflows/deploy.yml (sketch)
name: build-and-deploy
on: { push: { branches: [master] } }
jobs:
  build-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }
      - run: docker build -t ghcr.io/<org>/web:${{ github.sha }} .
      - run: docker push ghcr.io/<org>/web:${{ github.sha }}
      - run: docker build -t ghcr.io/<org>/agent-service:${{ github.sha }} ./agent-service
      - run: docker push ghcr.io/<org>/agent-service:${{ github.sha }}
      - name: Deploy
        run: |
          kubectl set image deployment/web web=ghcr.io/<org>/web:${{ github.sha }}
          kubectl set image deployment/agent-service agent-service=ghcr.io/<org>/agent-service:${{ github.sha }}
          kubectl rollout status deployment/web
```

`kubectl set image` + `rollingUpdate` strategy (4a) = zero-downtime deploy automatically, purani Pod tabhi terminate hoti hai jab nayi ready ho.

---

## 6. Honest recommendation

Is project ke current scale (ek Next.js app + ek Python microservice) pe **Kubernetes overkill hai**. Amplify/Render/Railway already: auto-restart, managed TLS, basic autoscaling, zero-config deploys de rahe hain — jo K8s manually maintain karne mein weeks lagenge (cluster upgrades, node patching, networking, RBAC, monitoring stack).

**K8s tabhi worth hoga jab:**
- 3+ independent services ho jaayein jinhe saath schedule/scale karna ho
- Multi-region deployment chahiye ho
- Fine-grained autoscaling policies chahiye ho jo PaaS provide nahi karta
- Team ke paas dedicated platform/SRE bandwidth ho cluster maintain karne ke liye

Tab tak: Docker seekhna/practice karna sahi hai (portability, local parity, interview value), lekin production migration ka ROI abhi negative hai. Jab scale aaye, upar ke manifests + gotchas (section 4f) ready template ki tarah use ho sakte hain.

---

## 7. AWS EKS — Deployment Q&A

> Section 1-6 generic K8s the (kisi bhi cloud/on-prem cluster pe apply hote). Ye section EKS-specific hai — AWS ka managed K8s control plane, aur wahi cheezein jo "vanilla K8s" se alag hoti hain jab tum specifically AWS pe deploy karte ho.

**Q: End-to-end — is project ko EKS pe deploy kaise karoge, step by step?**
A:
1. **ECR** (Elastic Container Registry) mein do private repos banao — `web` aur `agent-service`. CI (section 5) images build karke yahan push karega instead of GHCR.
2. **EKS cluster** create karo (`eksctl create cluster` ya Terraform/CDK) — ye ek managed VPC + control plane bana deta hai. Control plane AWS manage karta hai (upgrades, HA), tum sirf worker nodes ke zimmedar ho.
3. **Node group** attach karo — EC2-based managed node group (predictable cost, tum instance type choose karte ho) ya Fargate profile (serverless pods, per-pod billing, no node management, but no `hostPort`/DaemonSet support aur cold-start thoda zyada). Is workload ke liye — I/O-bound, bursty — **EC2 managed node group + Cluster Autoscaler/Karpenter** better hai Fargate se (Fargate per-pod pricing AI-wait-heavy pods pe waste hoga).
4. **AWS Load Balancer Controller** add-on install karo (Helm chart) — ye Ingress resources ko dekh kar automatically ek **ALB** (Application Load Balancer) provision karta hai. Section 4e ka generic `nginx`-style Ingress EKS pe iske annotations use karega: `alb.ingress.kubernetes.io/scheme: internet-facing`, `alb.ingress.kubernetes.io/target-type: ip`.
5. **IRSA** (IAM Roles for Service Accounts) setup karo — S3 access ke liye (audio upload, `lib/s3.ts`) pods ko ek IAM role attach karo via Kubernetes ServiceAccount annotation, static keys ki jagah.
6. **Secrets**: AWS Secrets Manager mein DB URL/API keys daalo, **External Secrets Operator** (ya AWS Secrets Store CSI driver) use karke unhe K8s Secret ki tarah pods mein sync karo — section 4d ka plain `Secret` yahan upgrade ho jaata hai.
7. Manifests (section 4a/4b/4c) `kubectl apply` karo, ya better — Helm chart / Argo CD se GitOps.
8. DB migration: Deployment ke `initContainers` mein ek one-shot container chalao jo `prisma migrate deploy` karke exit ho, tabhi main container start ho (Amplify ki `postBuild` step ka EKS-equivalent).

**Q: Sabse pehla practical challenge kya aayega jo Render/Amplify pe nahi tha?**
A: **Networking setup khud karna padega.** PaaS pe tum sirf code push karte ho aur URL milta hai. EKS pe VPC, subnets (public + private), NAT gateway, security groups, route tables — sab khud design/create karna hai (ya `eksctl`/Terraform module trust karna hai). Galat subnet sizing se pod IP exhaustion ho sakta hai (AWS VPC CNI default mein **har Pod ko ek real VPC IP milta hai** — chhoti subnet + zyada pods = "insufficient IP addresses" error, jo generic K8s mein exist hi nahi karta kyunki overlay networking use hoti hai).

**Q: Cost-wise EKS Render/Amplify se kaise compare hota hai?**
A: EKS control plane khud **$0.10/hour ≈ $73/month fixed** charge karta hai — chahe traffic ho ya na ho, chahe 1 pod chal raha ho. Upar se worker EC2 nodes, NAT gateway (~$32/month + data processing per GB), ALB (~$16/month + LCU usage), ECR storage. Render/Amplify ka free/hobby tier is poore cost floor ko avoid karta hai. Is project ke current scale pe EKS **section 6 ke "overkill" conclusion ko aur strong bana deta hai** — chhoti app ke liye control-plane cost hi kaafi hai justify na karne ke liye.

**Q: `lib/s3.ts` mein already static `ACCESS_KEY`/`SECRET_KEY` env vars hain — EKS pe ye kaam karega?**
A: Chalega, but ye anti-pattern hai jo EKS migrate karte waqt fix karna chahiye. Static IAM user keys — leak ho sakti hain, rotate manually karni padti hain, aur scope karna mushkil hai. EKS ka idiomatic tareeka: pod ke ServiceAccount ko IAM role se link karo (**IRSA** — OIDC provider cluster pe already hota hai), aur code se `credentials: { accessKeyId, secretAccessKey }` block hata do — AWS SDK ka default credential provider chain automatically IRSA se temporary, auto-rotating credentials utha lega. Chhota code change (`lib/s3.ts` mein `new S3Client({ region })` bas, credentials block hatao), bada security upgrade.

**Q: External services (Groq, OpenAI, Pinecone, Stripe, Neon) VPC ke andar se kaise reach honge?**
A: Ye sab public internet SaaS hain, VPC ke andar nahi — pods ko outbound internet access chahiye, jo **NAT Gateway** ke through jaata hai (private subnet mein nodes ho to). Har AI call (Groq/OpenAI/Pinecone) NAT se guzarti hai — high request volume pe NAT ka **per-GB data processing charge** meaningful ban sakta hai. Agar Neon ko RDS se replace karte (fully AWS-native), tab bhi RDS same VPC mein hota to NAT ki zaroorat nahi hoti DB ke liye — sirf AI/Stripe/SMTP calls NAT use karte.

**Q: HPA replicas badha deta hai lekin phir bhi pods "Pending" state mein atak jaate hain — kyun?**
A: HPA sirf **Pod count** badhata hai apne target Deployment ka — agar existing nodes mein resource capacity nahi hai naye pods schedule karne ke liye, wo `Pending` reh jaate hain jab tak koi naya **node** na aaye. EKS mein iske liye **Cluster Autoscaler** (ya better, **Karpenter** — AWS ka newer, faster node provisioner) alag se install/configure karna padta hai. Ye do-level scaling hai: HPA (pod-level) + Cluster Autoscaler/Karpenter (node-level) — dono ek saath chahiye, sirf HPA kaafi nahi.

**Q: Logs/monitoring PaaS jaisa built-in milega?**
A: Nahi, khud wire karna padega. Options: (a) **CloudWatch Container Insights** add-on (AWS-native, easy setup, per-GB ingestion cost), (b) self-hosted **Prometheus + Grafana** (more control, extra ops burden), (c) Langfuse jo already app mein hai wo sirf LLM traces cover karta hai, infra-level logs/metrics nahi. Render/Railway pe ye sab console mein already milta tha zero-config.

**Q: EKS version upgrade kaise handle hoga — ye bhi tumhari responsibility hai?**
A: Haan — control plane upgrade AWS-managed hai (button click / API call se trigger hota hai), lekin **worker nodes ka AMI/K8s version match** rakhna, deprecated API versions (`extensions/v1beta1` type cheezein) manifests mein fix karna, aur upgrade se pehle staging cluster pe test karna — ye sab operator (tumhara) zimmedari hai. PaaS pe ye pura invisible hota hai.

**Q: Is sab ke against, EKS use karne ka strongest case kab banta hai?**
A: Jab (a) already AWS-heavy ho (RDS, S3, Cognito, etc — same VPC mein sab kuch rakhna networking simplify karta hai), (b) compliance requirement ho jo fine-grained network policy/IAM control maange (IRSA, security groups per-pod via Security Groups for Pods), (c) multiple teams/services ho jo ek shared cluster pe cost-efficiently bin-pack ho sakein, ya (d) burst-scale itna unpredictable ho ki Karpenter jaisa sub-minute node provisioning genuinely zaroori ho. Single Next.js + single Python service ke liye — abhi in mein se koi bhi condition true nahi hai is project mein.
