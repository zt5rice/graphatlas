import { defaultLlm } from "../apps/api/src/agent/llm.ts";

const HIT_PROMPT = `You are an evidence judge for a knowledge-base retrieval benchmark.
Decide whether the provided EVIDENCE is sufficient to answer the QUESTION correctly,
i.e. it contains the factual answer. Reply with exactly "YES" or "NO".`;

const FAITHFULNESS_PROMPT = `You are a faithfulness judge for a knowledge-base retrieval benchmark.
Rate from 1 to 5 how faithfully the EVIDENCE reflects the EXPECTED ANSWER:
1 = contradicts it, 3 = partially supports, 5 = fully and accurately supports.
Reply with exactly one integer.`;

async function call(prompt: string, question: string, golden: string, evidence: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await defaultLlm(
        [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `QUESTION:\n${question}\n\nEXPECTED ANSWER:\n${golden}\n\nEVIDENCE:\n${evidence}`,
          },
        ],
        [],
      );
      return (response.content ?? "").trim();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function judgeHit(
  question: string,
  golden: string,
  evidence: string,
): Promise<boolean> {
  const answer = await call(HIT_PROMPT, question, golden, evidence);
  return answer.toUpperCase().startsWith("YES");
}

export async function judgeFaithfulness(
  question: string,
  golden: string,
  evidence: string,
): Promise<number> {
  const answer = await call(FAITHFULNESS_PROMPT, question, golden, evidence);
  const parsed = Number.parseInt(answer, 10);
  return Number.isNaN(parsed) ? 0 : Math.min(5, Math.max(1, parsed));
}
