import { LlmService } from "./llmService";

/**
 * Singleton instance of the LlmService for use throughout the application
 */
const llmServiceInstance = new LlmService();

export default llmServiceInstance;
