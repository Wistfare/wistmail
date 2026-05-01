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
  type DeriveDisplayNameJob,
  type ExtractMeetingJob,
} from './queues'
export { OllamaProvider } from './ollama'
export { OpenAIProvider } from './openai'
export { AnthropicProvider } from './anthropic'
export {
  createProvider,
  readProviderKindFromEnv,
  type AiProviderKind,
  type CreateProviderOptions,
} from './factory'
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
export { deriveDisplayName } from './jobs/derive-display-name'
export type { DeriveInput, DeriveOutput } from './jobs/derive-display-name'
export { deriveLocalPartName } from './jobs/local-part-heuristic'
export type { HeuristicResult } from './jobs/local-part-heuristic'
export { extractMeeting } from './jobs/extract-meeting'
export type { ExtractMeetingInput, ExtractMeetingOutput } from './jobs/types'
export { agenticIngest } from './jobs/agentic-ingest'
export type {
  AgenticIngestInput,
  AgenticIngestOutput,
  ToolCall,
} from './jobs/agentic-ingest'
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
