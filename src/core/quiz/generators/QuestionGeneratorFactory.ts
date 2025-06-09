import { getLogger } from "../../../utils/logger";
import {
    BaseQuestion,
    QuizMode,
    QuizOptions,
} from "../QuizTypes";
import { MixedQuestionGenerator } from "./MixedQuestionGenerator";
import { MultipleChoiceQuestionGenerator } from "./MultipleChoiceQuestionGenerator";
import { IQuestionGenerator } from "./QuestionGenerator";
import { ReadingQuestionGenerator } from "./ReadingQuestionGenerator";

const logger = getLogger("QuestionGeneratorFactory");

/**
 * Factory for creating question generators based on quiz mode and options
 */
export class QuestionGeneratorFactory {
    /**
     * Create a question generator for the given mode and options
     * @param options Quiz options
     */
    public static createGenerator(
        options: QuizOptions
    ): IQuestionGenerator<BaseQuestion> {
        const { mode, direction, numChoices } = options;

        logger.debug(
            `Creating generator for mode ${mode} with direction ${
                direction || "default"
            }`
        );

        switch (mode) {
            case QuizMode.Reading:
                return new ReadingQuestionGenerator();

            case QuizMode.ReverseMCQ:
                return new MultipleChoiceQuestionGenerator(
                    numChoices || 4
                );

            case QuizMode.Mixed:
                return new MixedQuestionGenerator(
                    true, // Include MCQ in mixed mode
                    numChoices || 4
                );

            default:
                logger.warn(
                    `Unknown mode ${mode}, defaulting to Mixed`
                );
                return new MixedQuestionGenerator();
        }
    }
}
