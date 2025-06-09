import csv from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import path from "path";
import { getLogger } from "../../utils/logger";
import {
    DeckInfo,
    ValidationError,
    ValidationResult,
    VocabularyItem,
} from "../quiz/QuizTypes";
import settingsInstance from "../settings/settingsInstance";

const logger = getLogger("DeckManager");

/**
 * Class responsible for managing Japanese vocabulary decks
 */
export class DeckManager {
    private decks: DeckInfo[];
    private deckMap: Map<string, VocabularyItem[]>;
    private pathSettings: any;

    constructor() {
        this.decks = [];
        this.deckMap = new Map();
        this.pathSettings =
            settingsInstance.getPathSettings();

        logger.debug("Initializing deck manager");

        // Load deck information
        this.loadDecks();
    }

    /**
     * Load deck information from JSON and CSV files
     */
    private async loadDecks(): Promise<void> {
        try {
            // Create data directory if it doesn't exist
            const dataDir = this.pathSettings.dataDir;
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                logger.debug(
                    `Created data directory: ${dataDir}`
                );
            }

            const deckConfigPath = path.join(
                dataDir,
                this.pathSettings.decksFile
            );

            // Create default deck config if it doesn't exist
            if (!fs.existsSync(deckConfigPath)) {
                logger.debug(
                    `Creating default deck config at ${deckConfigPath}`
                );
                const defaultConfig = {
                    decks: [
                        {
                            name: "default",
                            description:
                                "Bộ từ tiếng Nhật mặc định",
                            filename: "default.csv",
                        },
                    ],
                };
                fs.writeFileSync(
                    deckConfigPath,
                    JSON.stringify(defaultConfig, null, 2)
                );

                // Also create a sample default deck
                const defaultDeckPath = path.join(
                    dataDir,
                    "default.csv"
                );
                if (!fs.existsSync(defaultDeckPath)) {
                    logger.debug(
                        `Creating default deck at ${defaultDeckPath}`
                    );
                    const sampleData =
                        "japanese,reading,meaning\n" +
                        "本,ほん,sách\n" +
                        "水,みず,nước\n" +
                        "人,ひと,người\n" +
                        "山,やま,núi\n" +
                        "川,かわ,sông";
                    fs.writeFileSync(
                        defaultDeckPath,
                        sampleData
                    );
                }
            }

            // Load deck configuration
            logger.debug(
                `Loading deck configuration from ${deckConfigPath}`
            );
            const deckConfig = JSON.parse(
                fs.readFileSync(deckConfigPath, "utf-8")
            );
            this.decks = deckConfig.decks || [];

            // Load each deck
            for (const deck of this.decks) {
                await this.loadDeck(
                    deck.name,
                    deck.filename
                );
            }

            logger.debug(
                `Loaded ${this.decks.length} decks`
            );
        } catch (error) {
            logger.error("Error loading decks:", error);
        }
    }

    /**
     * Load a specific deck from CSV file
     */
    private loadDeck(
        name: string,
        filename: string
    ): Promise<void> {
        logger.debug(
            `Loading deck: ${name} from ${filename}`
        );
        return new Promise((resolve, reject) => {
            const deckPath = path.join(
                this.pathSettings.dataDir,
                filename
            );
            const items: VocabularyItem[] = [];

            if (!fs.existsSync(deckPath)) {
                logger.warn(
                    `Deck file not found: ${deckPath}`
                );
                this.deckMap.set(name, []);
                resolve();
                return;
            }

            fs.createReadStream(deckPath)
                .pipe(csv())
                .on("data", (data: any) => {
                    // Ensure the data has the required fields
                    if (
                        data.japanese &&
                        data.reading &&
                        data.meaning
                    ) {
                        items.push({
                            japanese: data.japanese,
                            reading: data.reading,
                            meaning: data.meaning,
                            sinoVietnamese:
                                data.sinoVietnamese || "",
                        });
                    }
                })
                .on("end", () => {
                    this.deckMap.set(name, items);
                    logger.debug(
                        `Loaded ${items.length} items from deck ${name}`
                    );
                    resolve();
                })
                .on("error", (error) => {
                    logger.error(
                        `Error loading deck ${name}:`,
                        error
                    );
                    reject(error);
                });
        });
    }

    /**
     * Get all available decks with their information
     */
    public getDecks(): DeckInfo[] {
        return this.decks;
    }

    /**
     * List all available decks with descriptions
     */
    public listAvailableDecks(): string[] {
        logger.debug(
            `Listing available decks (total: ${this.decks.length})`
        );
        return this.decks.map(
            (deck) => `${deck.name}: ${deck.description}`
        );
    }

    public listAvailableDecksNames(): string[] {
        return this.decks.map((deck) => deck.name);
    }

    /**
     * Get vocabulary items for a specific deck
     */
    public getDeckItems(
        deckName: string
    ): VocabularyItem[] {
        return this.deckMap.get(deckName) || [];
    }

    /**
     * Check if a deck exists
     */
    public deckExists(deckName: string): boolean {
        return this.deckMap.has(deckName);
    }

    /**
     * Create a new deck
     */
    public async createDeck(
        name: string,
        description: string,
        items: VocabularyItem[] = []
    ): Promise<boolean> {
        try {
            // Check if the deck already exists
            if (this.deckExists(name)) {
                logger.error(
                    `Deck already exists: ${name}`
                );
                return false;
            }

            // Validate items
            if (items.length > 0) {
                const validation =
                    this.validateItems(items);
                if (!validation.valid) {
                    logger.error(
                        `Validation error: ${validation.error}`
                    );
                    throw new Error(validation.error);
                }
            }

            // Create a new filename (sanitized name + .csv)
            const filename = `${name
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "_")}.csv`;
            const deckPath = path.join(
                this.pathSettings.dataDir,
                filename
            );

            // Save the items to CSV
            await this.saveItemsToCSV(deckPath, items);

            // Add to the decks list
            const newDeck: DeckInfo = {
                name,
                description,
                filename,
            };
            this.decks.push(newDeck);
            this.deckMap.set(name, items);

            // Update the deck configuration file
            await this.saveDeckConfig();

            logger.debug(`Created new deck: ${name}`);
            return true;
        } catch (error) {
            logger.error(
                `Error creating deck: ${name}`,
                error
            );
            return false;
        }
    }

    /**
     * Validate vocabulary items with detailed field-level errors
     * @param items The items to validate
     * @returns ValidationResult with detailed errors
     */
    public validateItemsDetailed(
        items: VocabularyItem[]
    ): ValidationResult {
        // Define maximum lengths
        const MAX_JAPANESE_LENGTH = 50;
        const MAX_READING_LENGTH = 100;
        const MAX_MEANING_LENGTH = 200;
        const MAX_SINOVIETNAMESE_LENGTH = 100;
        const MAX_ITEMS = 2000; // Maximum number of items per deck

        const errors: ValidationError[] = [];

        // Check maximum items
        if (items.length > MAX_ITEMS) {
            errors.push({
                field: "general",
                message: `Too many items: ${items.length}. Maximum allowed is ${MAX_ITEMS}.`,
            });
        }

        // Check for empty items and field lengths
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Check required fields
            if (
                !item.japanese ||
                item.japanese.trim() === ""
            ) {
                errors.push({
                    field: "japanese",
                    message:
                        "Japanese field cannot be empty",
                    index: i,
                });
            }
            if (
                !item.reading ||
                item.reading.trim() === ""
            ) {
                errors.push({
                    field: "reading",
                    message:
                        "Reading field cannot be empty",
                    index: i,
                });
            }
            if (
                !item.meaning ||
                item.meaning.trim() === ""
            ) {
                errors.push({
                    field: "meaning",
                    message:
                        "Meaning field cannot be empty",
                    index: i,
                });
            }

            // Check field lengths
            if (
                item.japanese &&
                item.japanese.length > MAX_JAPANESE_LENGTH
            ) {
                errors.push({
                    field: "japanese",
                    message: `Japanese text too long (${item.japanese.length} chars). Maximum is ${MAX_JAPANESE_LENGTH}.`,
                    index: i,
                });
            }
            if (
                item.reading &&
                item.reading.length > MAX_READING_LENGTH
            ) {
                errors.push({
                    field: "reading",
                    message: `Reading text too long (${item.reading.length} chars). Maximum is ${MAX_READING_LENGTH}.`,
                    index: i,
                });
            }
            if (
                item.meaning &&
                item.meaning.length > MAX_MEANING_LENGTH
            ) {
                errors.push({
                    field: "meaning",
                    message: `Meaning text too long (${item.meaning.length} chars). Maximum is ${MAX_MEANING_LENGTH}.`,
                    index: i,
                });
            }
            if (
                item.sinoVietnamese &&
                item.sinoVietnamese.length >
                    MAX_SINOVIETNAMESE_LENGTH
            ) {
                errors.push({
                    field: "sinoVietnamese",
                    message: `Sino-Vietnamese text too long (${item.sinoVietnamese.length} chars). Maximum is ${MAX_SINOVIETNAMESE_LENGTH}.`,
                    index: i,
                });
            }
        }

        // Check for duplicates in Japanese field
        const japaneseMap = new Map<string, number[]>();
        for (let i = 0; i < items.length; i++) {
            if (!items[i].japanese) continue;

            const japanese = items[i].japanese.trim();
            if (!japaneseMap.has(japanese)) {
                japaneseMap.set(japanese, [i]);
            } else {
                japaneseMap.get(japanese)?.push(i);
            }
        }

        // Add errors for duplicates
        for (const [
            japanese,
            indices,
        ] of japaneseMap.entries()) {
            if (indices.length > 1) {
                // Skip first occurrence (not a duplicate)
                for (let j = 1; j < indices.length; j++) {
                    errors.push({
                        field: "japanese",
                        message: `Duplicate Japanese word "${japanese}" also found at row ${
                            indices[0] + 1
                        }`,
                        index: indices[j],
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
        };
    }

    /**
     * Validate vocabulary items
     * @param items The items to validate
     * @returns Object with validation result and error message
     */
    private validateItems(items: VocabularyItem[]): {
        valid: boolean;
        error?: string;
    } {
        // Define maximum lengths
        const MAX_JAPANESE_LENGTH = 50;
        const MAX_READING_LENGTH = 100;
        const MAX_MEANING_LENGTH = 200;
        const MAX_SINOVIETNAMESE_LENGTH = 100;
        const MAX_ITEMS = 2000; // Maximum number of items per deck

        // Check maximum items
        if (items.length > MAX_ITEMS) {
            return {
                valid: false,
                error: `Too many items: ${items.length}. Maximum allowed is ${MAX_ITEMS}.`,
            };
        }

        // Check for empty items and field lengths
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Check required fields
            if (!item.japanese || !item.japanese.trim()) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has empty Japanese field`,
                };
            }
            if (!item.reading || !item.reading.trim()) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has empty Reading field`,
                };
            }
            if (!item.meaning || !item.meaning.trim()) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has empty Meaning field`,
                };
            }

            // Check field lengths
            if (
                item.japanese.length > MAX_JAPANESE_LENGTH
            ) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has Japanese text too long (${
                        item.japanese.length
                    } chars). Maximum is ${MAX_JAPANESE_LENGTH}.`,
                };
            }
            if (item.reading.length > MAX_READING_LENGTH) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has Reading text too long (${
                        item.reading.length
                    } chars). Maximum is ${MAX_READING_LENGTH}.`,
                };
            }
            if (item.meaning.length > MAX_MEANING_LENGTH) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has Meaning text too long (${
                        item.meaning.length
                    } chars). Maximum is ${MAX_MEANING_LENGTH}.`,
                };
            }
            if (
                item.sinoVietnamese &&
                item.sinoVietnamese.length >
                    MAX_SINOVIETNAMESE_LENGTH
            ) {
                return {
                    valid: false,
                    error: `Item #${
                        i + 1
                    } has Sino-Vietnamese text too long (${
                        item.sinoVietnamese.length
                    } chars). Maximum is ${MAX_SINOVIETNAMESE_LENGTH}.`,
                };
            }
        }

        // Check for duplicates in Japanese field
        const japaneseSet = new Set<string>();
        for (let i = 0; i < items.length; i++) {
            const japanese = items[i].japanese.trim();
            if (japaneseSet.has(japanese)) {
                return {
                    valid: false,
                    error: `Duplicate Japanese word found: "${japanese}" at item #${
                        i + 1
                    }`,
                };
            }
            japaneseSet.add(japanese);
        }

        return { valid: true };
    }

    public async updateDeckItems(
        deckName: string,
        items: VocabularyItem[]
    ): Promise<boolean> {
        try {
            // Check if the deck exists
            if (!this.deckExists(deckName)) {
                logger.error(`Deck not found: ${deckName}`);
                return false;
            }

            // Find the deck info
            const deckInfo = this.decks.find(
                (deck) => deck.name === deckName
            );
            if (!deckInfo) {
                logger.error(
                    `Deck info not found: ${deckName}`
                );
                return false;
            }

            // Validate items
            const validation = this.validateItems(items);
            if (!validation.valid) {
                logger.error(
                    `Validation error: ${validation.error}`
                );
                throw new Error(validation.error);
            }

            // Save the items to CSV
            const deckPath = path.join(
                this.pathSettings.dataDir,
                deckInfo.filename
            );
            await this.saveItemsToCSV(deckPath, items);

            // Update the in-memory map
            this.deckMap.set(deckName, items);

            logger.debug(
                `Updated deck: ${deckName} with ${items.length} items`
            );
            return true;
        } catch (error) {
            logger.error(
                `Error updating deck: ${deckName}`,
                error
            );
            return false;
        }
    }

    /**
     * Delete a deck
     */
    public async deleteDeck(
        deckName: string
    ): Promise<boolean> {
        try {
            // Check if the deck exists
            if (!this.deckExists(deckName)) {
                logger.error(`Deck not found: ${deckName}`);
                return false;
            }

            // Find the deck info
            const deckIndex = this.decks.findIndex(
                (deck) => deck.name === deckName
            );
            if (deckIndex === -1) {
                logger.error(
                    `Deck info not found: ${deckName}`
                );
                return false;
            }

            const deckInfo = this.decks[deckIndex];
            const deckPath = path.join(
                this.pathSettings.dataDir,
                deckInfo.filename
            );

            // Delete the CSV file
            if (fs.existsSync(deckPath)) {
                fs.unlinkSync(deckPath);
            }

            // Remove from the decks list and map
            this.decks.splice(deckIndex, 1);
            this.deckMap.delete(deckName);

            // Update the deck configuration file
            await this.saveDeckConfig();

            logger.debug(`Deleted deck: ${deckName}`);
            return true;
        } catch (error) {
            logger.error(
                `Error deleting deck: ${deckName}`,
                error
            );
            return false;
        }
    }

    /**
     * Save vocabulary items to a CSV file
     */
    private async saveItemsToCSV(
        filePath: string,
        items: VocabularyItem[]
    ): Promise<void> {
        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: "japanese", title: "japanese" },
                { id: "reading", title: "reading" },
                { id: "meaning", title: "meaning" },
                {
                    id: "sinoVietnamese",
                    title: "sinoVietnamese",
                },
            ],
        });

        await csvWriter.writeRecords(items);
    }

    /**
     * Save the deck configuration to JSON file
     */
    private async saveDeckConfig(): Promise<void> {
        const deckConfigPath = path.join(
            this.pathSettings.dataDir,
            this.pathSettings.decksFile
        );

        const config = {
            decks: this.decks,
        };

        fs.writeFileSync(
            deckConfigPath,
            JSON.stringify(config, null, 2)
        );
    }

    /**
     * Import a deck from a CSV file
     */
    public async importDeckFromCSV(
        name: string,
        description: string,
        csvFilePath: string
    ): Promise<boolean> {
        try {
            // Read the CSV file
            const items: VocabularyItem[] = [];
            await new Promise<void>((resolve, reject) => {
                fs.createReadStream(csvFilePath)
                    .pipe(csv())
                    .on("data", (data: any) => {
                        if (
                            data.japanese &&
                            data.reading &&
                            data.meaning
                        ) {
                            items.push({
                                japanese: data.japanese,
                                reading: data.reading,
                                meaning: data.meaning,
                                sinoVietnamese:
                                    data.sinoVietnamese ||
                                    "",
                            });
                        }
                    })
                    .on("end", () => resolve())
                    .on("error", reject);
            });

            // Validate the imported items
            const validation = this.validateItems(items);
            if (!validation.valid) {
                logger.error(
                    `Validation error in import: ${validation.error}`
                );
                throw new Error(validation.error);
            }

            // Create a new deck with the imported items
            const success = await this.createDeck(
                name,
                description,
                items
            );
            return success;
        } catch (error) {
            logger.error(
                `Error importing deck from CSV:`,
                error
            );
            return false;
        }
    }
}
