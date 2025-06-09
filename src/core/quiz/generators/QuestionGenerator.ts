import { getLogger } from "../../../utils/logger";
import {
    BaseQuestion,
    QuizMode,
    VocabularyItem,
} from "../QuizTypes";

const logger = getLogger("QuestionGenerator");

/**
 * Interface for question generators
 */
export interface IQuestionGenerator<
    T extends BaseQuestion
> {
    /**
     * Generate questions from vocabulary items
     */
    generate(
        items: VocabularyItem[],
        startIndex: number,
        endIndex: number
    ): T[];

    /**
     * Get the quiz mode this generator supports
     */
    getMode(): QuizMode;
}

/**
 * Abstract base class for question generators
 */
export abstract class BaseQuestionGenerator<
    T extends BaseQuestion
> implements IQuestionGenerator<T>
{
    protected readonly mode: QuizMode;

    constructor(mode: QuizMode) {
        this.mode = mode;
    }

    /**
     * Get the quiz mode this generator supports
     */
    public getMode(): QuizMode {
        return this.mode;
    }

    /**
     * Generate questions from vocabulary items
     * @param items Vocabulary items to use
     * @param startIndex Start index (inclusive)
     * @param endIndex End index (inclusive)
     */
    public abstract generate(
        items: VocabularyItem[],
        startIndex: number,
        endIndex: number
    ): T[];

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    protected shuffleArray<A>(array: A[]): A[] {
        logger.debug(
            `Shuffling array of ${array.length} items`
        );
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [
                newArray[j],
                newArray[i],
            ];
        }
        return newArray;
    }
}
