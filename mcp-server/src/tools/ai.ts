import { z } from "zod";
import { ecliApi } from "../ecli-client.js";

export const aiTools = [
  {
    name: "ecli_ai_chat",
    description: "Send a message to the panel's AI assistant and get a response.",
    inputSchema: z.object({
      message: z.string().describe("The message to send to the AI"),
      modelId: z.number().optional().describe("Specific AI model ID to use"),
    }),
    handler: async ({ message, modelId }: { message: string; modelId?: number }) => {
      return await ecliApi.ai.chat(message, modelId);
    },
  },
  {
    name: "ecli_list_ai_models",
    description: "List all AI models configured in the panel.",
    inputSchema: z.object({}),
    handler: async () => {
      return await ecliApi.ai.listModels();
    },
  },
  {
    name: "ecli_my_ai_models",
    description: "List AI models available to the current user (includes user-linked, org-linked, and plan-linked models).",
    inputSchema: z.object({}),
    handler: async () => {
      return await ecliApi.ai.myModels();
    },
  },
];