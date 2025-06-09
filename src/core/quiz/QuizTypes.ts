/**
 * Enums for quiz configuration
 */
export enum QuizMode {
    Mixed = 0, // Mix of different question types
    Reading = 1, // Japanese → Reading (Hiragana/Katakana)
    ReverseMCQ = 4, // Meaning → Japanese (multiple choice)
}

export enum StudyMode {
    Standard = "standard", // Regular quiz flow
    Conquest = "conquest", // Review incorrect answers
    Spaced = "spaced", // Spaced repetition
    Learn = "learn", // Learning mode with explanations
}

export enum QuestionDirection {
    Forward = "forward", // Japanese → Vietnamese
    Backward = "backward", // Vietnamese → Japanese
    Both = "both", // Both directions
}

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
 * Base interface for all question types
 */
export interface BaseQuestion {
    original: VocabularyItem;
    questionType: QuizMode;
}

/**
 * Interface for standard quiz question
 */
export interface QuizQuestion extends BaseQuestion {
    question: string;
    answer: string;
    isReading: boolean;
    isForward: boolean;
}

/**
 * Interface for multiple choice question
 */
export interface MultipleChoiceQuestion
    extends BaseQuestion {
    question: string;
    choices: string[];
    correctAnswer: string;
}

/**
 * Union type for all possible question types
 */
export type Question =
    | QuizQuestion
    | MultipleChoiceQuestion;

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

/**
 * Interface for quiz options
 */
export interface QuizOptions {
    deckName: string;
    mode: QuizMode;
    studyMode: StudyMode;
    range: string;
    timeoutSeconds: number;
    direction?: QuestionDirection;
    numChoices?: number; // For multiple choice questions
}
