export type { AiProvider } from './provider'
export {
  AI_QUEUE,
  JOB_NAMES,
  type JobName,
  type IngestEmailJob,
  type ClassifyNeedsReplyJob,
  type SummarizeJob,
  type AutoLabelJob,
  type DraftReplyJob,
  type TodayDigestJob,
} from './queues'
export { OllamaProvider } from './ollama'
export type {
  ContentPart,
  GenerateOptions,
  GenerateResult,
  Message,
  ToolDefinition,
} from './types'

export { classifyNeedsReply } from './jobs/classify-needs-reply'
export { summarizeEmail } from './jobs/summarize'
export { autoLabel } from './jobs/auto-label'
export { draftReply } from './jobs/draft-reply'
export { todayDigest } from './jobs/today-digest'
export type {
  ClassifyInput,
  ClassifyOutput,
  SummarizeInput,
  SummarizeOutput,
  AutoLabelInput,
  AutoLabelOutput,
  DraftReplyInput,
  DraftReplyOutput,
  TodayDigestInput,
  TodayDigestOutput,
} from './jobs/types'
