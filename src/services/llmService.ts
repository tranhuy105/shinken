import axios from "axios";
import { LlmRequestOptions } from "../models/QuizTypes";
import { GeminiLoadBalancer } from "./geminiLoadBalancer";
import settingsInstance from "./settingsInstance";

interface LlmResponse {
    response: string;
    done?: boolean;
    error?: string;
}

interface EvaluationResult {
    isCorrect: boolean;
    explanation: string;
    confidence?: number;
}

interface RetryConfig {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
}

/**
 * Provider enum for different LLM providers
 */
enum LlmProvider {
    GEMINI = "gemini",
    OLLAMA = "ollama",
}

/**
 * Robust service for interacting with LLM services (Google Gemini and local Ollama)
 */
export class LlmService {
    private readonly ollamaApiUrl: string;
    private readonly geminiApiUrl: string;
    private readonly defaultModel: string;
    private readonly ollamaModel: string;
    private readonly timeout: number;
    private readonly retryConfig: RetryConfig;
    private readonly geminiApiKey: string;
    private readonly primaryProvider: LlmProvider;
    private readonly geminiLoadBalancer: GeminiLoadBalancer;

    constructor(
        ollamaBaseUrl: string = "",
        ollamaModel: string = "",
        geminiApiKey: string = process.env.GEMINI_API_KEY ||
            "",
        timeout: number = 0
    ) {
        // Load settings
        const llmSettings =
            settingsInstance.getLlmSettings();

        // Set Ollama settings from parameters or settings
        ollamaBaseUrl =
            ollamaBaseUrl || llmSettings.ollama.baseUrl;
        ollamaModel =
            ollamaModel ||
            process.env.LLM_MODEL ||
            llmSettings.ollama.defaultModel;
        timeout = timeout || llmSettings.ollama.timeout;

        this.ollamaApiUrl = `${ollamaBaseUrl}/api/generate`;
        this.geminiApiUrl = llmSettings.gemini.baseUrl;
        this.ollamaModel = ollamaModel;
        this.defaultModel = llmSettings.gemini.defaultModel;
        this.timeout = timeout;
        this.retryConfig = {
            maxRetries: llmSettings.retry.maxRetries,
            baseDelay: llmSettings.retry.baseDelay,
            maxDelay: llmSettings.retry.maxDelay,
        };
        this.geminiApiKey = geminiApiKey;
        this.primaryProvider = geminiApiKey
            ? LlmProvider.GEMINI
            : LlmProvider.OLLAMA;

        // Initialize the Gemini load balancer with the API keys
        this.geminiLoadBalancer = new GeminiLoadBalancer(
            geminiApiKey,
            this.geminiApiUrl
        );

        console.log(
            `[LLM] Initialized with primary provider: ${
                this.primaryProvider
            }${
                this.primaryProvider === LlmProvider.GEMINI
                    ? ", fallback: Ollama"
                    : ""
            }`
        );
        console.log(
            `[LLM] Ollama model: ${ollamaModel} at ${ollamaBaseUrl}`
        );
    }

    /**
     * Exponential backoff delay calculation
     */
    private calculateDelay(attempt: number): number {
        const delay =
            this.retryConfig.baseDelay *
            Math.pow(2, attempt);
        return Math.min(delay, this.retryConfig.maxDelay);
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) =>
            setTimeout(resolve, ms)
        );
    }

    /**
     * Validate and sanitize prompt input
     */
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

    /**
     * Enhanced JSON extraction with multiple strategies and auto-fix
     */
    private extractJSON(text: string): any {
        if (!text || typeof text !== "string") {
            throw new Error(
                "Invalid text for JSON extraction"
            );
        }
        // Strategy 1: Find JSON blocks with code markers (```json or ```)
        const codeBlockPatterns = [
            /```json\s*(\{.*?\})\s*```/s,
            /```\s*(\{.*?\})\s*```/s,
            /`(\{.*?\})`/s,
        ];

        for (const pattern of codeBlockPatterns) {
            const match = text.match(pattern);
            if (match) {
                try {
                    const jsonStr =
                        this.fixCommonJSONIssues(match[1]);
                    const parsed = JSON.parse(jsonStr);
                    if (
                        this.isValidEvaluationResult(parsed)
                    ) {
                        console.log(
                            "[LLM] Successfully parsed JSON from code block"
                        );
                        return parsed;
                    }
                } catch (e) {
                    console.warn(
                        "[LLM] Failed to parse JSON from code block:",
                        e
                    );
                }
            }
        }

        // Strategy 2: Find JSON objects with enhanced regex
        const jsonPatterns = [
            // Multi-line JSON with nested braces
            /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gs,
            // Single line JSON
            /\{[^{}]+\}/g,
            // JSON with possible line breaks
            /\{\s*"[^"]+"\s*:\s*[^,}]+(?:\s*,\s*"[^"]+"\s*:\s*[^,}]+)*\s*\}/g,
        ];

        for (const pattern of jsonPatterns) {
            const matches = text.match(pattern);
            if (matches) {
                for (const match of matches) {
                    try {
                        const jsonStr =
                            this.fixCommonJSONIssues(match);
                        const parsed = JSON.parse(jsonStr);
                        if (
                            this.isValidEvaluationResult(
                                parsed
                            )
                        ) {
                            console.log(
                                "[LLM] Successfully parsed JSON from pattern match"
                            );
                            return parsed;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
        }

        // Strategy 3: Extract fields manually using regex
        try {
            const manuallyExtracted =
                this.extractFieldsManually(text);
            if (
                manuallyExtracted &&
                this.isValidEvaluationResult(
                    manuallyExtracted
                )
            ) {
                console.log(
                    "[LLM] Successfully extracted fields manually"
                );
                return manuallyExtracted;
            }
        } catch (e) {
            console.warn(
                "[LLM] Manual field extraction failed:",
                e
            );
        }

        // Strategy 4: Try to parse the entire response after cleanup
        try {
            const cleanedText = this.fixCommonJSONIssues(
                text.trim()
            );
            const parsed = JSON.parse(cleanedText);
            if (this.isValidEvaluationResult(parsed)) {
                console.log(
                    "[LLM] Successfully parsed entire response"
                );
                return parsed;
            }
        } catch (e) {
            console.warn(
                "[LLM] Failed to parse entire response:",
                e
            );
        }

        throw new Error(
            "No valid JSON found in response after all strategies"
        );
    }

    /**
     * Fix common JSON formatting issues
     */
    private fixCommonJSONIssues(jsonStr: string): string {
        return (
            jsonStr
                // Remove trailing text after closing brace
                .replace(/\}[\s\S]*$/, "}")
                // Fix missing commas between fields - line breaks
                .replace(
                    /(\"[^\"]*\")\s*\n\s*(\"[^\"]*\")/g,
                    "$1,\n  $2"
                )
                // Fix missing commas between fields - same line
                .replace(
                    /(\"[^\"]*\")\s+(\"[^\"]*\")/g,
                    "$1, $2"
                )
                // Fix missing commas after values before next field
                .replace(
                    /([}\]\"])\s*\n\s*(\"[^\"]*\")/g,
                    "$1,\n  $2"
                )
                // Fix missing commas after boolean/number values
                .replace(
                    /:\s*(true|false)\s+\"/g,
                    ': $1, "'
                )
                .replace(/:\s*(\d+\.?\d*)\s+\"/g, ': $1, "')
                // Remove trailing commas before closing brace
                .replace(/,(\s*\})/g, "$1")
                // Clean up whitespace
                .trim()
        );
    }

    /**
     * Extract JSON fields manually using regex when JSON parsing fails
     */
    private extractFieldsManually(
        text: string
    ): any | null {
        const result: any = {};

        // Extract isCorrect
        const isCorrectMatch = text.match(
            /"isCorrect"\s*:\s*(true|false)/i
        );
        if (isCorrectMatch) {
            result.isCorrect =
                isCorrectMatch[1].toLowerCase() === "true";
        }

        // Extract explanation
        const explanationMatch = text.match(
            /"explanation"\s*:\s*"([^"]+)"/
        );
        if (explanationMatch) {
            result.explanation = explanationMatch[1];
        }

        // Extract confidence
        const confidenceMatch = text.match(
            /"confidence"\s*:\s*([\d.]+)/
        );
        if (confidenceMatch) {
            result.confidence = parseFloat(
                confidenceMatch[1]
            );
        }

        // Validate we got the required fields
        if (
            "isCorrect" in result &&
            "explanation" in result
        ) {
            return result;
        }

        return null;
    }

    /**
     * Validate evaluation result structure
     */
    private isValidEvaluationResult(obj: any): boolean {
        return (
            typeof obj === "object" &&
            obj !== null &&
            typeof obj.isCorrect === "boolean" &&
            typeof obj.explanation === "string" &&
            obj.explanation.trim().length > 0
        );
    }

    /**
     * Call Google Gemini API
     */
    private async callGeminiApi(
        prompt: string,
        system: string,
        temperature: number,
        maxTokens: number
    ): Promise<string> {
        if (!this.geminiApiKey) {
            throw new Error(
                "Gemini API key not configured"
            );
        }

        console.log(
            "[LLM] Calling Gemini API via load balancer"
        );

        try {
            // Use the load balancer to make the API call
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

    /**
     * Call Ollama API (existing implementation)
     */
    private async callOllamaApi(
        prompt: string,
        system: string,
        temperature: number,
        maxTokens: number
    ): Promise<string> {
        console.log("[LLM] Calling Ollama API");

        const response = await axios.post<LlmResponse>(
            this.ollamaApiUrl,
            {
                model: this.ollamaModel,
                prompt: prompt,
                temperature: temperature,
                max_tokens: maxTokens,
                system: system,
                stream: false,
            },
            {
                timeout: this.timeout,
                validateStatus: (status) => status < 500, // Retry on 5xx errors
            }
        );

        if (response.status >= 400) {
            throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
            );
        }

        if (
            !response.data ||
            typeof response.data !== "object"
        ) {
            throw new Error(
                "Invalid response format from Ollama"
            );
        }

        if (response.data.error) {
            throw new Error(
                `Ollama Error: ${response.data.error}`
            );
        }

        const content = response.data.response;
        if (!content || typeof content !== "string") {
            throw new Error(
                "Empty or invalid response content from Ollama"
            );
        }

        return content.trim();
    }

    /**
     * Enhanced completion generation with provider fallback
     */
    async generateCompletion(
        prompt: string,
        options: LlmRequestOptions = {}
    ): Promise<string> {
        const sanitizedPrompt = this.validatePrompt(prompt);
        const temperature = Math.max(
            0,
            Math.min(2, options.temperature || 0.7)
        );
        const maxTokens = Math.max(
            1,
            Math.min(4096, options.maxTokens || 800)
        );
        const system = options.system || "";

        for (
            let attempt = 0;
            attempt <= this.retryConfig.maxRetries;
            attempt++
        ) {
            try {
                // Try primary provider first
                if (
                    this.primaryProvider ===
                        LlmProvider.GEMINI &&
                    this.geminiApiKey
                ) {
                    console.log(
                        `[LLM] Attempt ${attempt + 1}/${
                            this.retryConfig.maxRetries + 1
                        }: Using Gemini`
                    );
                    try {
                        // Use the load balancer for Gemini API calls
                        const response =
                            await this.callGeminiApi(
                                sanitizedPrompt,
                                system,
                                temperature,
                                maxTokens
                            );
                        console.log(
                            `[LLM] Success with Gemini on attempt ${
                                attempt + 1
                            }, response length: ${
                                response.length
                            }`
                        );
                        return response.trim();
                    } catch (geminiError) {
                        // Check if we have any available API keys left
                        if (
                            !this.geminiLoadBalancer.hasAvailableKeys()
                        ) {
                            console.error(
                                "[LLM] No available Gemini API keys, falling back to Ollama"
                            );
                            // Fall back to Ollama
                            const response =
                                await this.callOllamaApi(
                                    sanitizedPrompt,
                                    system,
                                    temperature,
                                    maxTokens
                                );
                            console.log(
                                `[LLM] Success with Ollama fallback on attempt ${
                                    attempt + 1
                                }, response length: ${
                                    response.length
                                }`
                            );
                            return response.trim();
                        } else {
                            // If we still have API keys but this particular one failed, just throw
                            // the error and let the retry logic handle it
                            throw geminiError;
                        }
                    }
                } else {
                    // Use Ollama directly if it's the primary or if Gemini API key is not available
                    console.log(
                        `[LLM] Attempt ${attempt + 1}/${
                            this.retryConfig.maxRetries + 1
                        }: Using Ollama`
                    );
                    const response =
                        await this.callOllamaApi(
                            sanitizedPrompt,
                            system,
                            temperature,
                            maxTokens
                        );
                    console.log(
                        `[LLM] Success with Ollama on attempt ${
                            attempt + 1
                        }, response length: ${
                            response.length
                        }`
                    );
                    return response.trim();
                }
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

                // Don't retry for certain types of errors
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
     * Check if error should not be retried
     */
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

    /**
     * Get readable error message
     */
    private getErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            if (error.code === "ECONNREFUSED") {
                return "LLM server is not running or unreachable";
            }
            if (error.code === "ENOTFOUND") {
                return "LLM server hostname could not be resolved";
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

    /**
     * Improved Japanese answer evaluation with robust fallbacks
     */
    async evaluateJapaneseAnswer(
        question: string,
        userAnswer: string,
        correctAnswer: string,
        isReading: boolean
    ): Promise<EvaluationResult> {
        console.log(
            `[LLM] Evaluating answer for question: ${question}`
        );
        console.log(
            `[LLM] User: "${userAnswer}" vs Correct: "${correctAnswer}"`
        );

        // Sanitize inputs
        const sanitizedUserAnswer = (
            userAnswer || ""
        ).trim();
        const sanitizedCorrectAnswer = (
            correctAnswer || ""
        ).trim();
        const sanitizedQuestion = (question || "").trim();

        if (!sanitizedQuestion) {
            throw new Error("Question cannot be empty");
        }

        // For reading questions, use enhanced string comparison
        if (isReading) {
            const isCorrect = this.compareReadingAnswers(
                sanitizedUserAnswer,
                sanitizedCorrectAnswer
            );
            console.log(
                `[LLM] Reading question, string comparison result: ${isCorrect}`
            );

            return {
                isCorrect,
                explanation: isCorrect
                    ? "Đúng! Cách đọc chính xác."
                    : `Sai. Cách đọc đúng là: ${sanitizedCorrectAnswer}`,
                confidence: 1.0,
            };
        }

        // For meaning questions, try LLM evaluation with fallbacks
        try {
            return await this.evaluateWithLLM(
                sanitizedQuestion,
                sanitizedUserAnswer,
                sanitizedCorrectAnswer
            );
        } catch (error) {
            console.error(
                "[LLM] LLM evaluation failed, using fallback:",
                this.getErrorMessage(error)
            );
            return this.fallbackEvaluation(
                sanitizedUserAnswer,
                sanitizedCorrectAnswer
            );
        }
    }

    /**
     * Enhanced reading answer comparison
     */
    private compareReadingAnswers(
        userAnswer: string,
        correctAnswer: string
    ): boolean {
        if (!userAnswer || !correctAnswer) return false;

        // Normalize for comparison
        const normalize = (str: string) =>
            str
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/[ー]/g, "") // Remove long vowel marks
                .trim();

        return (
            normalize(userAnswer) ===
            normalize(correctAnswer)
        );
    }

    /**
     * LLM-based evaluation for meaning questions
     */
    private async evaluateWithLLM(
        question: string,
        userAnswer: string,
        correctAnswer: string
    ): Promise<EvaluationResult> {
        const system = `You are an expert Japanese language teacher and evaluator for a Japanese language learning platform. Your task is to assess user answers for Japanese vocabulary questions with high accuracy and provide educational feedback.

EVALUATION GUIDELINES:
1. ACCURACY ASSESSMENT:
   - Carefully compare the user's answer with the correct answer, considering synonyms, alternative phrasings, and contextual equivalents.
   - For Japanese to Vietnamese translations, accept answers that capture the essential meaning, even if worded differently.
   - For Vietnamese to Japanese translations, consider grammatical particles, politeness levels, and character variants.
   - If the answer is in the wrong language, mark as incorrect with clear feedback about the expected language.

2. EDUCATIONAL FEEDBACK:
   - Provide detailed, constructive feedback in Vietnamese that helps the student learn.
   - For correct answers: Affirm correctness and provide additional context or nuance when relevant.
   - For incorrect answers: Explain the error specifically, compare with the correct answer, and offer learning tips.
   - If possible always provide an example sentence and synonyms of the correct answer in JAPANESE regardless of the language of the correct answer. Provide the example sentence, synonyms along with the explanation.

3. RESPONSE FORMAT:
   - Always respond with valid JSON in this format:
   {
     "isCorrect": boolean,
     "explanation": "Detailed feedback in Vietnamese explaining assessment reasoning",
     "confidence": number from 0.0 to 1.0 reflecting your confidence in the evaluation
   }
   - No additional text or formatting outside the JSON structure.

EXAMPLES:
For correct synonym: {"isCorrect": true, "explanation": "Đúng! 'Ngôi nhà' là cách dịch chính xác của từ '家'. Từ này còn có thể chỉ 'gia đình' tùy ngữ cảnh.", "confidence": 0.95}
For partially correct: {"isCorrect": true, "explanation": "Đúng về nghĩa cơ bản! Tuy nhiên, '元気' còn có thể hiểu sâu hơn là 'khỏe mạnh, tràn đầy sức sống' chứ không chỉ đơn thuần là 'khỏe'.", "confidence": 0.85}
For incorrect: {"isCorrect": false, "explanation": "Chưa chính xác. '図書館' (toshokan) có nghĩa là 'thư viện', không phải 'nhà sách'. Nhà sách trong tiếng Nhật là '本屋' (honya).", "confidence": 0.98}`;

        const prompt = `Evaluate the following Japanese vocabulary question and answer:

QUESTION/WORD: ${question}
USER'S ANSWER: "${userAnswer}"
CORRECT ANSWER: "${correctAnswer}"

Evaluate whether the user's answer correctly captures the meaning of the Japanese word or phrase. Consider synonyms, alternative expressions, and contextual equivalents. Provide detailed feedback in Vietnamese.

Your response must be valid JSON with this structure:
{"isCorrect": boolean, "explanation": "detailed feedback in Vietnamese", "confidence": number from 0.0 to 1.0}`;

        const completion = await this.generateCompletion(
            prompt,
            {
                system,
                temperature: 0.5, // Lower temperature for more consistent evaluations
                maxTokens: 500,
            }
        );

        console.log(`[LLM] Raw completion: ${completion}`);

        try {
            const result = this.extractJSON(completion);

            // Validate and clean result
            const cleanResult: EvaluationResult = {
                isCorrect: Boolean(result.isCorrect),
                explanation: String(
                    result.explanation ||
                        "Không có giải thích"
                ).trim(),
                confidence:
                    typeof result.confidence === "number"
                        ? Math.max(
                              0,
                              Math.min(1, result.confidence)
                          )
                        : 0.8,
            };

            // Ensure explanation is not empty
            if (
                !cleanResult.explanation ||
                cleanResult.explanation ===
                    "Không có giải thích"
            ) {
                cleanResult.explanation =
                    cleanResult.isCorrect
                        ? "Câu trả lời đúng!"
                        : `Câu trả lời không chính xác. Đáp án là: ${correctAnswer}`;
            }

            console.log(
                "[LLM] Parsed result:",
                cleanResult
            );
            return cleanResult;
        } catch (error) {
            console.error(
                `[LLM] JSON extraction failed: ${this.getErrorMessage(
                    error
                )}`
            );
            throw new Error(
                `Failed to parse LLM response: ${this.getErrorMessage(
                    error
                )}`
            );
        }
    }

    /**
     * Fallback evaluation when LLM is unavailable
     */
    private fallbackEvaluation(
        userAnswer: string,
        correctAnswer: string
    ): EvaluationResult {
        const isCorrect =
            userAnswer.toLowerCase().trim() ===
            correctAnswer.toLowerCase().trim();

        console.log(
            `[LLM] Fallback evaluation result: ${isCorrect}`
        );

        return {
            isCorrect,
            explanation: isCorrect
                ? "Đúng! (đánh giá cơ bản)"
                : `Sai. Đáp án đúng là: ${correctAnswer} (đánh giá cơ bản)`,
            confidence: 0.6,
        };
    }

    /**
     * Health check for LLM service
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Add a check for the Gemini load balancer as well
            if (
                this.primaryProvider ===
                    LlmProvider.GEMINI &&
                this.geminiApiKey
            ) {
                const hasAvailableKeys =
                    this.geminiLoadBalancer.hasAvailableKeys();
                if (!hasAvailableKeys) {
                    console.warn(
                        "[LLM] Health check: No available Gemini API keys"
                    );
                    return false;
                }
            }

            const response = await this.generateCompletion(
                "Test",
                { maxTokens: 10 }
            );
            return response.length > 0;
        } catch (error) {
            console.error(
                "[LLM] Health check failed:",
                this.getErrorMessage(error)
            );
            return false;
        }
    }
}
