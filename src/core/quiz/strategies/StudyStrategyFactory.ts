import { getLogger } from "../../../utils/logger";
import { BaseQuestion, StudyMode } from "../QuizTypes";
import { ConquestStudyStrategy } from "./ConquestStudyStrategy";
import { SpacedRepetitionStudyStrategy } from "./SpacedRepetitionStudyStrategy";
import { StandardStudyStrategy } from "./StandardStudyStrategy";
import { IStudyStrategy } from "./StudyStrategy";

const logger = getLogger("StudyStrategyFactory");

/**
 * Factory for creating study strategies
 */
export class StudyStrategyFactory {
    /**
     * Create a study strategy for the given mode and questions
     * @param mode The study mode to create a strategy for
     * @param questions The questions to study
     */
    public static createStrategy(
        mode: StudyMode,
        questions: BaseQuestion[]
    ): IStudyStrategy {
        logger.debug(
            `Creating strategy for mode ${mode} with ${questions.length} questions`
        );

        switch (mode) {
            case StudyMode.Standard:
                return new StandardStudyStrategy(questions);

            case StudyMode.Conquest:
                return new ConquestStudyStrategy(questions);

            case StudyMode.Spaced:
                return new SpacedRepetitionStudyStrategy(
                    questions
                );

            case StudyMode.Learn:
                // For now, learn mode is similar to standard
                // In the future, it can be enhanced with explanations
                logger.debug(
                    `Learn mode currently uses StandardStudyStrategy (to be enhanced)`
                );
                return new StandardStudyStrategy(questions);

            default:
                logger.debug(
                    `Unknown mode ${mode}, defaulting to Standard`
                );
                return new StandardStudyStrategy(questions);
        }
    }
}
