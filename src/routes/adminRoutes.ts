import express from "express";
import path from "path";
import { VocabularyItem } from "../models/QuizTypes";
import deckManagerInstance from "../services/deckManagerInstance";

const router = express.Router();

// Admin dashboard home
router.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../../public/admin/index.html"
        )
    );
});

// Get all decks
router.get("/decks", (req, res) => {
    const decks = deckManagerInstance.getDecks();
    res.json({ decks });
});

// Get a specific deck
router.get("/decks/:name", (req, res) => {
    const deckName = req.params.name;

    if (!deckManagerInstance.deckExists(deckName)) {
        return res
            .status(404)
            .json({ error: "Deck not found" });
    }

    const items =
        deckManagerInstance.getDeckItems(deckName);
    const deck = deckManagerInstance
        .getDecks()
        .find((d) => d.name === deckName);

    res.json({
        name: deckName,
        description: deck?.description || "",
        items,
    });
});

// Create a new deck
router.post("/decks", express.json(), async (req, res) => {
    const { name, description, items } = req.body;

    if (!name) {
        return res
            .status(400)
            .json({ error: "Deck name is required" });
    }

    // Validate items format
    if (items && !Array.isArray(items)) {
        return res
            .status(400)
            .json({ error: "Items must be an array" });
    }

    // Create new deck
    const success = await deckManagerInstance.createDeck(
        name,
        description || "",
        items || []
    );

    if (success) {
        res.status(201).json({
            message: "Deck created successfully",
        });
    } else {
        res.status(500).json({
            error: "Failed to create deck",
        });
    }
});

// Update deck metadata
router.patch(
    "/decks/:name/metadata",
    express.json(),
    async (req, res) => {
        const oldName = req.params.name;
        const { name: newName, description } = req.body;

        if (!deckManagerInstance.deckExists(oldName)) {
            return res
                .status(404)
                .json({ error: "Deck not found" });
        }

        if (!newName) {
            return res
                .status(400)
                .json({ error: "Deck name is required" });
        }

        // Check if new name already exists and it's not the same deck
        if (
            newName !== oldName &&
            deckManagerInstance.deckExists(newName)
        ) {
            return res.status(400).json({
                error: "A deck with this name already exists",
            });
        }

        try {
            // For this prototype, we'll implement a basic metadata update functionality
            // First, get the current deck items
            const items =
                deckManagerInstance.getDeckItems(oldName);

            // If the name is changing, create a new deck with the new name and delete the old one
            if (newName !== oldName) {
                // Create a new deck with the new name
                const createSuccess =
                    await deckManagerInstance.createDeck(
                        newName,
                        description || "",
                        items
                    );

                if (!createSuccess) {
                    throw new Error(
                        "Failed to create deck with new name"
                    );
                }

                // Delete the old deck
                const deleteSuccess =
                    await deckManagerInstance.deleteDeck(
                        oldName
                    );

                if (!deleteSuccess) {
                    // Try to roll back by deleting the new deck
                    await deckManagerInstance.deleteDeck(
                        newName
                    );
                    throw new Error(
                        "Failed to delete old deck during rename operation"
                    );
                }
            } else {
                // Just update the description if only that changed
                // Get the deck info
                const deck = deckManagerInstance
                    .getDecks()
                    .find((d) => d.name === oldName);
                if (
                    deck &&
                    deck.description !== description
                ) {
                    // We would need to add a method to DeckManager to update just the description
                    // For now, we'll use a workaround - create a temporary deck and delete the old one
                    const tempName = `${oldName}_temp_${Date.now()}`;

                    // Create temp deck
                    const createSuccess =
                        await deckManagerInstance.createDeck(
                            tempName,
                            description || "",
                            items
                        );

                    if (!createSuccess) {
                        throw new Error(
                            "Failed to create temporary deck during update"
                        );
                    }

                    // Delete old deck
                    const deleteSuccess =
                        await deckManagerInstance.deleteDeck(
                            oldName
                        );

                    if (!deleteSuccess) {
                        // Roll back by deleting the temp deck
                        await deckManagerInstance.deleteDeck(
                            tempName
                        );
                        throw new Error(
                            "Failed to delete old deck during update"
                        );
                    }

                    // Create final deck with original name
                    const finalSuccess =
                        await deckManagerInstance.createDeck(
                            oldName,
                            description || "",
                            items
                        );

                    if (!finalSuccess) {
                        throw new Error(
                            "Failed to recreate deck with updated description"
                        );
                    }

                    // Delete temp deck
                    await deckManagerInstance.deleteDeck(
                        tempName
                    );
                }
            }

            res.json({
                message:
                    "Deck metadata updated successfully",
                name: newName,
                description: description || "",
            });
        } catch (error) {
            console.error(
                "Error updating deck metadata:",
                error
            );
            res.status(500).json({
                error: "Failed to update deck metadata",
            });
        }
    }
);

// Update a deck's content
router.put(
    "/decks/:name",
    express.json(),
    async (req, res) => {
        const deckName = req.params.name;
        const { items } = req.body;

        if (!deckManagerInstance.deckExists(deckName)) {
            return res
                .status(404)
                .json({ error: "Deck not found" });
        }

        // Validate items format
        if (!Array.isArray(items)) {
            return res
                .status(400)
                .json({ error: "Items must be an array" });
        }

        // Validate each item has the required fields
        const validItems = items.every(
            (item: any) =>
                item.japanese &&
                item.reading &&
                item.meaning
        );

        if (!validItems) {
            return res.status(400).json({
                error: "All items must have japanese, reading, and meaning fields",
            });
        }

        // Update deck
        const success =
            await deckManagerInstance.updateDeckItems(
                deckName,
                items as VocabularyItem[]
            );

        if (success) {
            res.json({
                message: "Deck updated successfully",
            });
        } else {
            res.status(500).json({
                error: "Failed to update deck",
            });
        }
    }
);

// Delete a deck
router.delete("/decks/:name", async (req, res) => {
    const deckName = req.params.name;

    if (!deckManagerInstance.deckExists(deckName)) {
        return res
            .status(404)
            .json({ error: "Deck not found" });
    }

    const success = await deckManagerInstance.deleteDeck(
        deckName
    );

    if (success) {
        res.json({ message: "Deck deleted successfully" });
    } else {
        res.status(500).json({
            error: "Failed to delete deck",
        });
    }
});

// Parse CSV text and create deck
router.post(
    "/parse-csv",
    express.json(),
    async (req, res) => {
        const { name, description, csvText } = req.body;

        if (!name) {
            return res
                .status(400)
                .json({ error: "Deck name is required" });
        }

        if (!csvText) {
            return res
                .status(400)
                .json({ error: "CSV text is required" });
        }

        try {
            // Parse CSV text
            const items: VocabularyItem[] = [];
            const lines = csvText.trim().split("\n");

            // Skip header row if it exists
            const startIndex = lines[0]
                .toLowerCase()
                .includes("japanese")
                ? 1
                : 0;

            for (
                let i = startIndex;
                i < lines.length;
                i++
            ) {
                const parts = lines[i].split(",");
                if (parts.length >= 3) {
                    items.push({
                        japanese: parts[0].trim(),
                        reading: parts[1].trim(),
                        meaning: parts[2].trim(),
                        sinoVietnamese:
                            parts.length > 3
                                ? parts[3].trim()
                                : "",
                    });
                }
            }

            if (items.length === 0) {
                return res.status(400).json({
                    error: "No valid items found in CSV",
                });
            }

            // Create the deck
            const success =
                await deckManagerInstance.createDeck(
                    name,
                    description || "",
                    items
                );

            if (success) {
                res.status(201).json({
                    message: "Deck created successfully",
                    itemCount: items.length,
                });
            } else {
                res.status(500).json({
                    error: "Failed to create deck",
                });
            }
        } catch (error) {
            console.error("Error parsing CSV:", error);
            res.status(400).json({
                error: "Failed to parse CSV text",
            });
        }
    }
);

// Add new validate deck route
router.post(
    "/validate-deck",
    express.json(),
    async (req, res) => {
        const { items } = req.body;

        console.log(items);

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                error: "Invalid request: items array is required",
            });
        }

        try {
            console.log(
                "Items received for validation:",
                items
            );

            // Access the validateItemsDetailed method
            const validation =
                deckManagerInstance.validateItemsDetailed(
                    items
                );

            console.log("Validation result:", validation);

            return res.json(validation);
        } catch (error) {
            console.error(
                "[AdminRoutes] Error validating deck:",
                error
            );
            return res.status(500).json({
                error: "Failed to validate deck items",
            });
        }
    }
);

export default router;
