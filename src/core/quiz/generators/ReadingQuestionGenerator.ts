import { getLogger } from "../../../utils/logger";
import {
    QuizMode,
    QuizQuestion,
    VocabularyItem,
} from "../QuizTypes";
import { BaseQuestionGenerator } from "./QuestionGenerator";

const logger = getLogger("ReadingQuestionGenerator");

/**
 * Generator for reading questions (Japanese → Reading)
 */
export class ReadingQuestionGenerator extends BaseQuestionGenerator<QuizQuestion> {
    constructor() {
        super(QuizMode.Reading);
    }

    /**
     * Generate reading questions from vocabulary items
     */
    public generate(
        items: VocabularyItem[],
        startIndex: number,
        endIndex: number
    ): QuizQuestion[] {
        logger.debug(
            `Generating reading questions from index ${startIndex} to ${endIndex}`
        );

        const questions: QuizQuestion[] = [];

        for (let i = startIndex; i <= endIndex; i++) {
            const item = items[i];
            logger.debug(
                `Processing item: ${item.japanese}`
            );

            // Reading mode: Japanese → Reading (Hiragana/Katakana)
            questions.push({
                question: item.japanese,
                answer: item.reading,
                original: item,
                isReading: true,
                isForward: true,
                questionType: QuizMode.Reading,
            });
        }

        logger.debug(
            `Generated ${questions.length} reading questions total`
        );
        return questions;
    }
}
