# Production Latency Scenarios — AI Resume Coach

> Interview preparation guide: project mein jo performance problems actually handle aur track ki gayi hain, unko production scenario ke form mein kaise explain karein.

## Project architecture

```text
Browser
   ↓
Next.js API — AWS Amplify
   ↓
PostgreSQL / Neon
   ↓
Python Agent Service — Railway
   ↓
Groq / OpenAI / GitHub / Pinecone
```

Production request ka total time sirf application code ka time nahi hota:

```text
Total latency =
API processing
+ DB connection-pool wait
+ DB query time
+ Amplify → Railway network time
+ background-job queue wait
+ agent execution
+ external LLM/tool latency
+ response serialization
```

---

## 1. Long-running AI requests timeout ho rahi thi

### Problem

Candidate screening, Hiring Committee aur Recruitment Copilot jaise agents ko 20–90 seconds lag sakte hain. Inhe normal synchronous HTTP request mein chalane par serverless request timeout hone aur completed result lose hone ka risk tha.

### Maine kya kiya

- Long-running agent operations ko background job queue mein move kiya.
- API turant `202 + jobId` return karti hai.
- Frontend job status poll karta hai.
- Job ka node-by-node progress store hota hai.
- Worker crash hone par lease expire hone ke baad doosra worker job claim kar sakta hai.
- Maximum attempts aur overall job timeout bounded hain.

### Maine kya track kiya

Har job ke saath ye timestamps store hote hain:

- `created_at`
- `started_at`
- `finished_at`

Inse do important measurements milti hain:

```text
Queue wait     = started_at - created_at
Execution time = finished_at - started_at
Total time     = finished_at - created_at
```

Agar queue wait high hai lekin execution normal hai, toh bottleneck worker capacity hai. Agar queue wait normal hai aur execution high hai, toh bottleneck LLM, external tool ya agent graph mein hai.

### Project references

- `agent-service/core/jobs.py`
- `app/api/recruiter-copilot/route.ts`
- `app/api/agent-jobs/[id]/route.ts`

### Interview mein aise bolo

> “Mere AI agents 20–90 seconds le rahe the aur synchronous requests timeout ho sakti thi. Maine unhe background jobs mein convert kiya. Created, started aur finished timestamps track karke queue latency aur execution latency ko separate kiya. Isse pata chalta tha ki bottleneck worker saturation hai ya actual AI execution.”

---

## 2. GitHub tool ka connection setup slow tha

### Problem

Candidate screening mein GitHub profile check hota hai. Har call par naya MCP connection/process setup hone se repeated overhead approximately 4.5 seconds tha.

### Maine kya kiya

- Long-lived MCP connection pool banaya.
- Existing GitHub connection ko reuse kiya.
- Tool call par timeout lagaya.
- Expired GitHub token par unauthenticated fallback diya.

### Result

Project guide mein documented measurement ke according repeated connection overhead approximately:

```text
Before: 4.5 seconds
After:  0.1 seconds
```

### Project references

- `agent-service/core/mcp_pool.py`
- `agent-service/agents/shared/tools.py`
- `PROJECT_GUIDE.md` — Problems and solutions section

### Interview mein aise bolo

> “Candidate screening mein GitHub check ka connection setup approximately 4.5 seconds le raha tha. Maine MCP connection ko long-lived pool mein reuse kiya, jisse repeated calls ka connection overhead approximately 0.1 seconds reh gaya.”

---

## 3. Sequential AI calls live interview ko slow kar rahi thi

### Problem

Candidate ke answer submit karne ke baad do independent operations hoti hain:

1. Confidence aur follow-up analysis
2. Adaptive interview checkpoint/difficulty processing

Agar dono sequentially chalti hain, total latency dono calls ka sum ban jaati hai:

```text
Operation A = 8 seconds
Operation B = 7 seconds
Sequential total ≈ 15 seconds
```

### Maine kya kiya

Independent operations ko `Promise.all()` se parallel run kiya.

```text
Parallel total ≈ max(8, 7) ≈ 8 seconds
```

### Project references

- `app/api/interview/public/answer/route.ts`
- `app/api/interview/answer/route.ts`

### Interview mein aise bolo

> “Live interview mein answer submit ke baad independent AI operations sequential chal rahi thi. Maine dependency check karke unhe parallel execute kiya. Isse latency operations ke sum ke bajay slowest operation ke aas-paas aa gayi.”

> Exact percentage improvement tabhi quote karna chahiye jab production measurement available ho.

---

## 4. Per-question database updates ke bahut round-trips the

### Problem

Interview create karte waqt generated questions ke additional fields individually update ho rahe the.

```text
10 questions = up to 10 separate DB round-trips
```

Local database par ye fast lag sakta hai, lekin production mein remote PostgreSQL ke har round-trip ke saath network latency add hoti hai. Question count badhne par latency bhi grow karti hai.

### Maine kya kiya

Multiple question updates ko ek batched SQL statement mein combine kiya.

```text
Before: N database round-trips
After:  1 batched database round-trip
```

### Project reference

- `app/api/interview/create/route.ts`

### Interview mein aise bolo

> “Local database par per-question updates fast thi, lekin production mein remote database ke karan latency question count ke saath badh rahi thi. Maine N individual updates ko ek batched SQL update mein convert kiya.”

---

## 5. Bulk resume upload sequential process hone par slow tha

### Problem

Recruiter ek request mein maximum 50 resumes upload kar sakta hai. Sab files sequentially process karne par request timeout territory mein ja sakti thi.

Doosri taraf, sabhi 50 files ek saath process karne par:

- Database connection pool exhaust ho sakta tha.
- CPU aur memory spike ho sakte the.
- External APIs rate-limit kar sakti thi.

### Maine kya kiya

- Resumes ko five-file batches mein process kiya.
- Ek batch ki files parallel process hoti hain.
- Current batch complete hone ke baad next batch start hota hai.
- Batch size ko Prisma connection limit ke saath align kiya.
- File count aur payload limits lagayi.

### Limits

| Item | Limit |
|---|---:|
| Single resume | 5 MB |
| ZIP upload | 50 MB |
| Files per request | 50 |
| Processing batch | 5 |

### Project reference

- `app/api/resume/bulk-upload/route.ts`

### Interview mein aise bolo

> “Bulk upload mein fully sequential processing slow thi aur fully parallel processing database ko overload kar sakti thi. Maine bounded concurrency use ki—five files per batch—and is batch size ko Prisma connection pool ke saath align kiya.”

---

## 6. Database connections ko production capacity ke according bound kiya

### Problem

AWS Amplify/serverless environment mein multiple instances unlimited PostgreSQL connections create karein toh Neon/database connection limit exhaust ho sakti hai. Query fast hone ke baad bhi connection-pool wait API ko slow bana sakta hai.

### Maine kya kiya

- Prisma connection limit `5` rakhi.
- Pool timeout `10 seconds` rakha.
- Bulk processing concurrency bhi `5` rakhi.
- Frequently queried fields par indexes add kiye.
- Independent read queries ko suitable places par parallel run kiya.

### Track/diagnose karne wale signals

- Pool timeout errors
- Query execution time
- Connection acquire wait
- Concurrent DB operations
- Returned rows

### Project references

- `lib/db.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260418000001_add_indexes/migration.sql`

### Interview mein aise bolo

> “Maine application concurrency ko database capacity se align kiya. Prisma pool five connections ka tha, isliye bulk processing batch bhi five rakha. Isse application database ki capacity se zyada parallel queries nahi bhejti.”

---

## 7. External AI latency, failure aur cost track ki

### Problem

Groq/OpenAI latency application ke control mein nahi hoti. Provider slow, rate-limited ya temporarily unavailable ho sakta hai.

### Maine kya kiya

- Langfuse mein AI generations trace ki.
- Feature, model, token usage, steps aur cost record kiye.
- Candidate PII ko trace payload mein redact kiya.
- Har direct LLM call par 30-second timeout lagaya.
- Groq fail/rate-limit hone par OpenAI fallback diya.
- Failure ke baad Groq ko five-minute cooldown par rakha.

### Maine kya compare kiya

- Provider-wise latency
- Timeout/failure count
- Fallback count
- Prompt aur completion tokens
- Per-feature AI cost
- Agent ke individual steps

Fallback reliability improve karta hai, lekin final latency badh sakti hai. Example: Groq timeout ke baad OpenAI call hone par dono ka wait total latency mein include ho sakta hai.

### Project references

- `lib/groq.ts`
- `lib/langfuse.ts`
- `agent-service/core/llm.py`
- `agent-service/core/observability.py`

### Interview mein aise bolo

> “External LLM meri sabse unpredictable dependency thi. Maine Langfuse se model, call duration, agent steps, tokens aur cost track ki. Calls par timeout aur Groq-to-OpenAI fallback rakha, isliye main application latency aur provider latency ko distinguish kar sakta tha.”

---

## 8. Agent worker saturation identify ki

### Problem

Agent service default two background job workers start karti hai. Agar bahut saari screening requests ek saath aa jayein, later jobs queue mein wait karti hain.

### Diagnosis

```text
High queue wait + normal execution time
→ Worker saturation

Normal queue wait + high execution time
→ Slow LLM, external tool ya agent graph
```

Useful signals:

- Queued jobs count
- Oldest queued job age
- Active workers
- Average job execution time
- Worker utilization

Workers tabhi increase karne chahiye jab:

- Queue consistently grow ho rahi ho.
- Queue wait high ho.
- CPU/memory mein headroom ho.
- DB pool aur LLM quota extra concurrency support karte hon.

### Project references

- `agent-service/main.py`
- `agent-service/core/jobs.py`

### Interview mein aise bolo

> “Maine sirf total job time nahi dekha; queue wait aur execution time separate kiya. Isse worker saturation aur slow LLM execution mein distinction mila. Workers blindly increase nahi kiye, kyunki usse DB pool ya AI-provider rate limit next bottleneck ban sakte the.”

---

## 9. Uncontrolled LLM parallelism ko cap kiya

### Problem

Hiring Committee multiple candidates aur multiple AI evaluators parallel run kar sakti hai. Unlimited fan-out se:

- Provider rate limit hit ho sakta hai.
- Cost spike ho sakti hai.
- Memory pressure badh sakta hai.
- Tail latency aur retries increase ho sakti hain.

### Maine kya kiya

- Hiring Committee concurrency configurable rakhi.
- Default maximum concurrency `8` rakhi.
- Provider-side rate limiter aur call timeouts use kiye.

### Project references

- `agent-service/main.py`
- `agent-service/core/observability.py`
- `agent-service/core/llm.py`

### Interview mein aise bolo

> “Parallel processing se latency improve hoti hai, lekin unlimited parallelism production dependency ko overload kar sakta hai. Isliye maine bounded concurrency rakhi. Goal maximum parallelism nahi, sustainable throughput tha.”

---

## 10. Concurrent jobs aur slot booking mein lock contention handle ki

### Problem A: Same job ko multiple workers claim kar sakte the

Job queue mein multiple workers/replicas same queued job dekh sakte hain.

### Solution

- Job claim query mein `FOR UPDATE SKIP LOCKED` use kiya.
- Claimed job par lease rakhi.
- Worker crash ho toh lease expiry ke baad retry hota hai.
- Maximum attempts bounded hain.
- Duplicate submissions ke liye idempotency key support hai.

### Problem B: Same interview slot do candidates book kar sakte the

Do requests ek hi time par `isBooked = false` read kar sakti hain.

### Solution

Conditional update ko transaction ke andar atomic banaya:

```text
UPDATE slot
WHERE id = selected_slot
AND isBooked = false
```

Sirf ek request ka affected-row count `1` ho sakta hai.

### Project references

- `agent-service/core/jobs.py`
- `app/api/interview/public/book-slot/route.ts`

### Interview mein aise bolo

> “Job workers ke beech contention ko `FOR UPDATE SKIP LOCKED` se handle kiya, aur slot booking mein check-and-update ko ek atomic transaction mein rakha. Isse same job double-run aur same slot double-book nahi hota.”

---

## Strongest project-backed scenarios

Interview ke liye in five scenarios ko priority do:

1. **AI request timeout → background job queue**
2. **GitHub connection 4.5s → approximately 0.1s through connection reuse**
3. **Sequential AI operations → parallel execution**
4. **N database updates → one batched update**
5. **50 resume uploads → bounded concurrency of five**

---

## Complete interview answer

> “Mere project mein production latency ke kuch real cases aaye. Pehla, AI agents 20–90 seconds lete the, isliye synchronous requests timeout ho sakti thi. Maine background job queue banayi aur created, started aur finished timestamps se queue wait aur execution time separately track kiya.
>
> Candidate screening mein GitHub tool ka connection setup approximately 4.5 seconds leta tha. Maine long-lived MCP connection pooling aur reuse implement kiya, jisse repeated connection overhead approximately 0.1 seconds ho gaya.
>
> Live interview mein independent AI operations sequential chal rahi thi, isliye unhe parallel execute kiya. Interview creation mein per-question database updates ko ek batched SQL update mein convert kiya. Bulk resume upload mein fully sequential aur fully parallel processing ke beech bounded concurrency use ki—five files per batch, aligned with the Prisma connection pool.
>
> External LLM calls ko Langfuse mein model, duration, agent steps, tokens aur cost ke saath track kiya. Calls par timeout aur Groq-to-OpenAI fallback diya. Isliye mera approach workers blindly increase karna nahi tha; pehle queue wait, DB latency, network aur external-provider latency ko separate karke actual bottleneck identify karta tha.”

---

## Interview honesty note

Project mein LLM tracing, job timestamps, progress, usage aur cost tracking available hai. Lekin complete platform-wide P50/P95/P99 dashboard repository mein evident nahi hai.

Isliye:

- Documented measurement, jaise GitHub connection `4.5s → 0.1s`, confidently bata sakte ho.
- Jahan exact numbers record nahi hain, architecture-level improvement explain karo.
- Exact percentage ya percentile fabricate mat karo.
- Aise bolo: “I measured/compared queue wait and execution time” ya “I would aggregate these timings into P50/P95/P99.”
