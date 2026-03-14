import { EventEmitter } from 'events';
// emits 'usage' with object { userId?, organisationId?, modelId, tokens, requests, timestamp }
// probably smallest service in the universe
export const aiEmitter = new EventEmitter();