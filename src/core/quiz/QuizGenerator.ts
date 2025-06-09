import { getLogger } from "../../utils/logger";
import { QuestionGeneratorFactory } from "./generators/QuestionGeneratorFactory";
import {
    BaseQuestion,
    QuizOptions,
    VocabularyItem,
} from "./QuizTypes";

// Get module logger
const logger = getLogger("QuizGenerator");

/**
 * Main quiz generator that creates questions based on specified options
 */
export class QuizGenerator {
    /**
     * Generate questions for a quiz based on options
     * @param items Vocabulary items to use
     * @param options Quiz options including mode, range, etc.
     */
    public generateQuestions(
        items: VocabularyItem[],
        options: QuizOptions
    ): BaseQuestion[] {
        logger.info(
            `Generating questions with mode ${options.mode}, study mode ${options.studyMode}`
        );

        // Parse range to get start and end indices
        const { startIndex, endIndex } = this.parseRange(
            options.range,
            items.length
        );

        logger.info(
            `Parsed range: ${startIndex + 1} to ${
                endIndex + 1
            } of ${items.length} items`
        );

        // Create appropriate generator based on mode and options
        const generator =
            QuestionGeneratorFactory.createGenerator(
                options
            );

        // Generate questions
        const questions = generator.generate(
            items,
            startIndex,
            endIndex
        );

        logger.info(
            `Generated ${questions.length} questions total`
        );
        return questions;
    }

    /**
     * Parse range string to get start and end indices
     * @param range Range string like "all", "1-20", "5"
     * @param totalItems Total number of items available
     */
    private parseRange(
        range: string,
        totalItems: number
    ): { startIndex: number; endIndex: number } {
        logger.debug(`Parsing range: ${range}`);

        // Default to all items
        let startIndex = 0;
        let endIndex = totalItems - 1;

        if (range !== "all") {
            const rangeParts = range.split("-");

            if (rangeParts.length === 2) {
                // Range like "1-20"
                startIndex =
                    parseInt(rangeParts[0], 10) - 1;
                endIndex = parseInt(rangeParts[1], 10) - 1;
            } else if (rangeParts.length === 1) {
                // Single index like "5"
                const singleIndex =
                    parseInt(rangeParts[0], 10) - 1;
                if (!isNaN(singleIndex)) {
                    startIndex = singleIndex;
                    endIndex = singleIndex;
                }
            }
        }

        // Validate and clamp indices
        startIndex = Math.max(
            0,
            isNaN(startIndex) ? 0 : startIndex
        );
        endIndex = Math.min(
            totalItems - 1,
            isNaN(endIndex) ? totalItems - 1 : endIndex
        );
        endIndex = Math.max(startIndex, endIndex);

        return { startIndex, endIndex };
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    public shuffleArray<T>(array: T[]): T[] {
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
