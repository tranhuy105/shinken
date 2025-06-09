import axios from "axios";
import { getLogger } from "../../utils/logger";
import settingsInstance from "../settings/settingsInstance";
import { GeminiLoadBalancer } from "./geminiLoadBalancer";

interface LlmRequestOptions {
    system?: string;
    temperature?: number;
    maxTokens?: number;
}

interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
}

const logger = getLogger("LlmService");

/**
 * Minimal LLM service focused on Japanese explanation functionality using Gemini only
 */
export class LlmService {
    private readonly geminiApiUrl: string;
    private readonly timeout: number;
    private readonly retryConfig: RetryConfig;
    private readonly geminiLoadBalancer: GeminiLoadBalancer;
    private readonly defaultModel: string;
    private readonly geminiApiKey: string;

    constructor(
        geminiApiKey: string = process.env.GEMINI_API_KEY ||
            "",
        timeout: number = 0
    ) {
        const llmSettings =
            settingsInstance.getLlmSettings();

        if (!geminiApiKey) {
            throw new Error("Gemini API key is required");
        }

        timeout = timeout ?? 30000;

        this.geminiApiUrl = llmSettings.gemini.baseUrl;
        this.defaultModel = llmSettings.gemini.defaultModel;
        this.timeout = timeout;
        this.retryConfig = {
            maxRetries: llmSettings.retry.maxRetries,
            baseDelay: llmSettings.retry.baseDelay,
            maxDelay: llmSettings.retry.maxDelay,
        };
        this.geminiApiKey = geminiApiKey;

        this.geminiLoadBalancer = new GeminiLoadBalancer(
            geminiApiKey,
            this.geminiApiUrl
        );

        logger.debug(
            "Initialized with Gemini as the only provider"
        );
    }

    private calculateDelay(attempt: number): number {
        const delay =
            this.retryConfig.baseDelay *
            Math.pow(2, attempt);
        return Math.min(delay, this.retryConfig.maxDelay);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) =>
            setTimeout(resolve, ms)
        );
    }

    private validatePrompt(prompt: string): string {
        if (!prompt || typeof prompt !== "string") {
            throw new Error(
                "Prompt must be a non-empty string"
            );
        }

        const sanitized = prompt.trim();
        if (sanitized.length === 0) {
            throw new Error(
                "Prompt cannot be empty after trimming"
            );
        }

        if (sanitized.length > 10000) {
            console.warn(
                "[LLM] Prompt is very long, truncating..."
            );
            return sanitized.substring(0, 10000);
        }

        return sanitized;
    }

    private async callGeminiApi(
        prompt: string,
        system: string,
        temperature: number,
        maxTokens: number
    ): Promise<string> {
        logger.debug(
            "Calling Gemini API via load balancer"
        );

        try {
            const payload = {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }],
                    },
                ],
                systemInstruction: {
                    parts: [{ text: system }],
                },
                generationConfig: {
                    temperature: temperature,
                    maxOutputTokens: maxTokens,
                    topP: 0.95,
                    topK: 40,
                },
            };

            const response =
                await this.geminiLoadBalancer.callGeminiApi(
                    payload,
                    this.timeout
                );

            if (
                !response ||
                !response.candidates ||
                response.candidates.length === 0
            ) {
                throw new Error(
                    "Empty or invalid response from Gemini API"
                );
            }

            const content = response.candidates[0].content;
            if (
                !content ||
                !content.parts ||
                content.parts.length === 0
            ) {
                throw new Error(
                    "No content in Gemini API response"
                );
            }

            return content.parts[0].text || "";
        } catch (error) {
            console.error(
                "[LLM] Error calling Gemini API:",
                this.getErrorMessage(error)
            );
            throw error;
        }
    }

    private isNonRetryableError(error: any): boolean {
        if (error instanceof Error) {
            const message = error.message.toLowerCase();
            return (
                message.includes("invalid") ||
                message.includes("prompt") ||
                message.includes("authentication")
            );
        }

        if (axios.isAxiosError(error)) {
            return (
                error.response?.status === 401 ||
                error.response?.status === 403 ||
                error.response?.status === 400
            );
        }

        return false;
    }

    private getErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNREFUSED") {
                return "Gemini API server is not reachable";
            }
            if (error.code === "ENOTFOUND") {
                return "Gemini API hostname could not be resolved";
            }
            if (error.response) {
                return `HTTP ${error.response.status}: ${error.response.statusText}`;
            }
            return error.message;
        }

        return error instanceof Error
            ? error.message
            : String(error);
    }

    async generateCompletion(
        prompt: string,
        options: LlmRequestOptions = {}
    ): Promise<string> {
        const sanitizedPrompt = this.validatePrompt(prompt);
        const temperature = Math.max(
            0,
            Math.min(2, options.temperature ?? 1)
        );
        const maxTokens = Math.max(
            1,
            Math.min(4096, options.maxTokens ?? 1024)
        );
        const system = options.system || "";

        for (
            let attempt = 0;
            attempt <= this.retryConfig.maxRetries;
            attempt++
        ) {
            try {
                logger.debug(
                    `Attempt ${attempt + 1}/${
                        this.retryConfig.maxRetries + 1
                    }: Using Gemini`
                );

                const response = await this.callGeminiApi(
                    sanitizedPrompt,
                    system,
                    temperature,
                    maxTokens
                );

                logger.debug(
                    `Success with Gemini on attempt ${
                        attempt + 1
                    }, response length: ${response.length}`
                );

                return response.trim();
            } catch (error) {
                const isLastAttempt =
                    attempt === this.retryConfig.maxRetries;

                console.error(
                    `[LLM] Attempt ${attempt + 1} failed:`,
                    this.getErrorMessage(error)
                );

                if (isLastAttempt) {
                    throw new Error(
                        `Failed to generate completion after ${
                            this.retryConfig.maxRetries + 1
                        } attempts: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }

                if (this.isNonRetryableError(error)) {
                    throw error;
                }

                const delay = this.calculateDelay(attempt);
                console.log(
                    `[LLM] Retrying in ${delay}ms...`
                );
                await this.sleep(delay);
            }
        }

        throw new Error("Unexpected end of retry loop");
    }

    /**
     * Get detailed explanation for Japanese vocabulary or grammar
     */
    async explainJapanese(
        text: string,
        options: any = {}
    ): Promise<string> {
        const system = `Bạn là một giáo viên tiếng Nhật chuyên nghiệp, có chuyên môn sâu về ngôn ngữ học, từ vựng, kanji, ngữ pháp và bối cảnh văn hóa. Đặc biệt, bạn hiểu rõ lợi thế của người Việt khi học tiếng Nhật thông qua hệ thống Hán Việt.

NGUYÊN TẮC QUAN TRỌNG:
1. PHƯƠNG PHÁP PHÂN TÍCH:
   - Xác định đây là từ vựng hay ngữ pháp
   - ĐỐI VỚI TỪ VỰNG: Ưu tiên phân tích âm Hán Việt trước, sau đó mới đến các khía cạnh khác
   - ĐỐI VỚI NGỮ PHÁP: Giải thích cấu trúc, chức năng, ngữ cảnh phù hợp

2. CẤU TRÚC GIẢI THÍCH BẰNG TIẾNG VIỆT:
   - TỔNG QUAN: Giới thiệu ngắn gọn về từ/ngữ pháp
   - PHÂN TÍCH HÁN VIỆT (với từ vựng): 
     * Đọc âm Hán Việt của từng chữ
     * Ý nghĩa gốc trong tiếng Việt
     * Liên hệ với từ Việt tương đương
     * Sau đó mới phân tích On'yomi và Kun'yomi
   - Ý NGHĨA & CÁCH DÙNG: Giải thích chi tiết với các sắc thái, cách kết hợp
   - VÍ DỤ CÂU: 3-5 câu thực tế với bản dịch tiếng Việt
   - TỪ ĐỒNG NGHĨA/LIÊN QUAN: So sánh sự khác biệt
   - GHI CHÚ VĂN HÓA: (nếu có)
   - MẸO HỌC: Tận dụng Hán Việt và các chiến lược ghi nhớ

3. YÊU CẦU ĐỊNH DẠNG:
   - Sử dụng Markdown để tổ chức rõ ràng
   - Dùng tiêu đề (##, ###) để phân chia các phần
   - In đậm các thuật ngữ tiếng Nhật
   - Sử dụng bullet points cho danh sách
   - Ghi rõ cấp độ JLPT nếu biết

4. CHẤT LƯỢNG NỘI DUNG:
   - Chính xác và toàn diện
   - Phù hợp với nhiều trình độ học viên
   - Tập trung vào ứng dụng thực tế
   - Tận dụng tối đa lợi thế Hán Việt của người học Việt Nam`;

        const prompt = `Hãy giải thích chi tiết thuật ngữ/cụm từ/ngữ pháp tiếng Nhật sau:\n\n${text}\n\nVui lòng cung cấp giải thích chi tiết, toàn diện bằng tiếng Việt, theo cấu trúc đã hướng dẫn.`;

        return await this.generateCompletion(prompt, {
            system,
            temperature: options.temperature ?? 0.3,
            maxTokens: options.maxTokens ?? 2000,
        });
    }
}
