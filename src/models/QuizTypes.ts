/**
 * Interface for a Japanese vocabulary item
 */
export interface VocabularyItem {
    japanese: string;
    reading: string;
    meaning: string;
    sinoVietnamese?: string; // "âm hán việt" - optional field
}

/**
 * Interface for field validation results
 */
export interface ValidationError {
    field: string;
    message: string;
    index?: number;
}

/**
 * Interface for validation results
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Interface for quiz question
 */
export interface QuizQuestion {
    question: string;
    answer: string;
    original: VocabularyItem;
    isReading: boolean;
    isForward: boolean;
}

/**
 * Interface for deck info
 */
export interface DeckInfo {
    name: string;
    description: string;
    filename: string;
}

/**
 * Interface for LLM API request options
 */
export interface LlmRequestOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    system?: string;
}
