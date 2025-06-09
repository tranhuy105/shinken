import fs from "fs";
import path from "path";
import { getLogger } from "../../utils/logger";
import settingsInstance from "../settings/settingsInstance";
import { VocabularyItem } from "./QuizTypes";

const logger = getLogger("ReviewManager");

/**
 * Manager for handling review items (missed questions)
 */
export class ReviewManager {
    private reviewItems: Map<string, VocabularyItem[]>;
    private readonly dataDir: string;
    private readonly reviewFile: string;

    constructor() {
        this.reviewItems = new Map();

        // Get path settings
        const pathSettings =
            settingsInstance.getPathSettings();
        this.dataDir = pathSettings.dataDir;
        this.reviewFile = path.join(
            this.dataDir,
            "review_items.json"
        );

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Load review items
        this.loadReviewItems();

        logger.info("Review manager initialized");
    }

    /**
     * Load review items from disk
     */
    private loadReviewItems(): void {
        try {
            if (fs.existsSync(this.reviewFile)) {
                const data = fs.readFileSync(
                    this.reviewFile,
                    "utf-8"
                );
                const parsed = JSON.parse(data);

                // Convert to Map
                this.reviewItems = new Map();
                for (const [
                    userId,
                    items,
                ] of Object.entries(parsed)) {
                    this.reviewItems.set(
                        userId,
                        items as VocabularyItem[]
                    );
                }

                logger.debug(
                    `Loaded review items for ${this.reviewItems.size} users`
                );
            } else {
                logger.debug(
                    "No review items file found, starting with empty state"
                );
            }
        } catch (error) {
            logger.error(
                "Error loading review items:",
                error
            );
            this.reviewItems = new Map();
        }
    }

    /**
     * Save review items to disk
     */
    private saveReviewItems(): void {
        try {
            // Convert Map to object for JSON serialization
            const data: Record<string, VocabularyItem[]> =
                {};
            for (const [
                userId,
                items,
            ] of this.reviewItems.entries()) {
                data[userId] = items;
            }

            fs.writeFileSync(
                this.reviewFile,
                JSON.stringify(data, null, 2)
            );
            logger.debug("Saved review items to disk");
        } catch (error) {
            logger.error(
                "Error saving review items:",
                error
            );
        }
    }

    /**
     * Add a vocabulary item to a user's review list
     */
    public addReviewItem(
        userId: string,
        item: VocabularyItem
    ): void {
        // Get user's review items or create new array
        const items = this.reviewItems.get(userId) || [];

        // Check if item already exists (by Japanese text)
        const exists = items.some(
            (existing) =>
                existing.japanese === item.japanese
        );

        if (!exists) {
            items.push(item);
            this.reviewItems.set(userId, items);
            this.saveReviewItems();
            logger.debug(
                `Added review item for user ${userId}: ${item.japanese}`
            );
        } else {
            logger.debug(
                `Review item already exists for user ${userId}: ${item.japanese}`
            );
        }
    }

    /**
     * Get review items for a user
     */
    public getReviewItems(
        userId: string
    ): VocabularyItem[] {
        return this.reviewItems.get(userId) || [];
    }

    /**
     * Remove a vocabulary item from a user's review list
     */
    public removeReviewItem(
        userId: string,
        japaneseText: string
    ): boolean {
        const items = this.reviewItems.get(userId) || [];
        const initialLength = items.length;

        // Remove item with matching Japanese text
        const filteredItems = items.filter(
            (item) => item.japanese !== japaneseText
        );

        if (filteredItems.length < initialLength) {
            this.reviewItems.set(userId, filteredItems);
            this.saveReviewItems();
            logger.debug(
                `Removed review item for user ${userId}: ${japaneseText}`
            );
            return true;
        }

        return false;
    }

    /**
     * Clear all review items for a user
     */
    public clearReviewItems(userId: string): void {
        this.reviewItems.set(userId, []);
        this.saveReviewItems();
        logger.debug(
            `Cleared all review items for user ${userId}`
        );
    }

    /**
     * Check if a user has any review items
     */
    public hasReviewItems(userId: string): boolean {
        const items = this.reviewItems.get(userId) || [];
        return items.length > 0;
    }

    /**
     * Get the count of review items for a user
     */
    public getReviewItemCount(userId: string): number {
        const items = this.reviewItems.get(userId) || [];
        return items.length;
    }
}
