// Re-export shape so per-page sub-components don't import from server/.
export interface SessionTurn {
  span_id: string;
  timestamp: string;
  request_model: string;
  response_model: string;
  input: number;
  output: number;
  duration_ms: number;
  finish_reasons: string;
}
