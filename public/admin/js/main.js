document.addEventListener("DOMContentLoaded", () => {
    // DOM elements
    const decksList = document.getElementById("decksList");
    const deckEditView =
        document.getElementById("deckEditView");
    const deckTableBody =
        document.getElementById("deckTableBody");
    const editDeckName =
        document.getElementById("editDeckName");
    const deckNameEdit =
        document.getElementById("deckNameEdit");
    const deckDescriptionEdit = document.getElementById(
        "deckDescriptionEdit"
    );
    const deckUsageInfo =
        document.getElementById("deckUsageInfo");

    // Modal elements
    const modals = {
        newDeck: {
            backdrop: document.getElementById(
                "newDeckModalBackdrop"
            ),
            modal: document.getElementById("newDeckModal"),
        },
        importCsv: {
            backdrop: document.getElementById(
                "importCsvModalBackdrop"
            ),
            modal: document.getElementById(
                "importCsvModal"
            ),
        },
        confirmDelete: {
            backdrop: document.getElementById(
                "confirmDeleteModalBackdrop"
            ),
            modal: document.getElementById(
                "confirmDeleteModal"
            ),
        },
        alert: {
            backdrop: document.getElementById(
                "alertModalBackdrop"
            ),
            modal: document.getElementById("alertModal"),
        },
    };

    // State variables
    let currentDeckName = "";
    let currentDeckItems = [];
    let currentDeckDescription = "";
    let selectedCells = [];
    let clipboard = null;
    let startCell = null;
    let endCell = null;

    // Initialize
    loadDecks();
    setupModalHandlers();

    // Event Listeners
    document
        .getElementById("refreshBtn")
        .addEventListener("click", loadDecks);
    document
        .getElementById("newDeckBtn")
        .addEventListener("click", () =>
            showModal(modals.newDeck)
        );
    document
        .getElementById("backToListBtn")
        .addEventListener("click", showDecksList);
    document
        .getElementById("importCsvBtn")
        .addEventListener("click", () => {
            // Reset file upload field when opening the modal
            document.getElementById(
                "uploadFileName"
            ).textContent = "";
            document.getElementById("csvFileUpload").value =
                "";
            document.getElementById("csvText").value = "";
            showModal(modals.importCsv);
        });
    document
        .getElementById("createDeckBtn")
        .addEventListener("click", createNewDeck);
    document
        .getElementById("importDeckBtn")
        .addEventListener("click", importDeck);
    document
        .getElementById("addRowBtn")
        .addEventListener("click", addNewRow);
    document
        .getElementById("saveChangesBtn")
        .addEventListener("click", saveChanges);
    document
        .getElementById("confirmDeleteBtn")
        .addEventListener("click", deleteDeck);

    // Setup CSV file upload handler
    document
        .getElementById("csvFileUpload")
        .addEventListener("change", handleCsvFileUpload);

    // Add keyboard event listeners for copy/paste operations
    document.addEventListener("keydown", handleKeyDown);

    // Setup modal handlers
    function setupModalHandlers() {
        // Setup close buttons for all modals
        document
            .querySelectorAll("[data-dismiss='modal']")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    // Find modal object by ID
                    const modalElement =
                        button.closest(".modal");
                    if (!modalElement) return;

                    const modalId = modalElement.id;
                    let modalObj = null;

                    // Find the corresponding modal object
                    Object.values(modals).forEach(
                        (modal) => {
                            if (
                                modal.modal.id === modalId
                            ) {
                                modalObj = modal;
                            }
                        }
                    );

                    if (modalObj) {
                        hideModal(modalObj);
                    }
                });
            });

        // Close modal when clicking on backdrop
        Object.values(modals).forEach((modal) => {
            modal.backdrop.addEventListener(
                "click",
                (e) => {
                    if (e.target === modal.backdrop) {
                        hideModal(modal);
                    }
                }
            );
        });
    }

    function showModal(modal) {
        modal.backdrop.classList.add("show");
        setTimeout(() => {
            modal.modal.classList.add("show");
        }, 10);
    }

    function hideModal(modal) {
        // Check if modal and modal.modal are defined before accessing properties
        if (modal && modal.modal) {
            modal.modal.classList.remove("show");
        }

        setTimeout(() => {
            // Check if modal and modal.backdrop are defined before accessing properties
            if (modal && modal.backdrop) {
                modal.backdrop.classList.remove("show");
            }
        }, 300);
    }

    // Functions
    async function loadDecks() {
        try {
            decksList.innerHTML = `
                <div class="section-title">
                    <i class="ri-folder-line"></i>
                    <span>Your Vocabulary Decks</span>
                </div>
                <p class="help-text">
                    Manage your Japanese vocabulary decks here. Each deck can be used with the Shinken Discord bot for learning and testing.
                    Create new decks, edit existing ones, or import from CSV.
                </p>
                <div class="loading">
                    <div class="spinner"></div>
                </div>
            `;

            const response = await fetch("/admin/decks");

            if (!response.ok) {
                throw new Error(
                    `Error: ${response.status}`
                );
            }

            const data = await response.json();
            renderDecksList(data.decks);
        } catch (error) {
            console.error("Failed to load decks:", error);
            decksList.innerHTML = `
                <div class="section-title">
                    <i class="ri-folder-line"></i>
                    <span>Your Vocabulary Decks</span>
                </div>
                <div class="alert alert-danger">
                    Failed to load decks. Please try again later.
                </div>
            `;
        }
    }

    function renderDecksList(decks) {
        // Keep the section title and help text
        const sectionTitle = `
            <div class="section-title">
                <i class="ri-folder-line"></i>
                <span>Your Vocabulary Decks</span>
            </div>
            <p class="help-text">
                Manage your Japanese vocabulary decks here. Each deck can be used with the Shinken bot for learning and testing.
                Create new decks, edit existing ones, or import from CSV.
            </p>
        `;

        if (!decks || decks.length === 0) {
            decksList.innerHTML = `
                ${sectionTitle}
                <div class="alert alert-info">
                    <p>No decks found. Click "New Deck" to create one.</p>
                </div>
            `;
            return;
        }

        let decksHtml = `
            ${sectionTitle}
            <div class="deck-grid">
        `;

        decks.forEach((deck) => {
            decksHtml += `
                <div class="deck-card" data-deck="${
                    deck.name
                }">
                    <div class="deck-header">
                        <h3 class="deck-title">${
                            deck.name
                        }</h3>
                        <p class="deck-description">${
                            deck.description ||
                            "No description"
                        }</p>
                    </div>
                    <div class="deck-body">
                        <div class="deck-meta">
                            <div class="deck-meta-item">
                                <i class="ri-file-list-line"></i>
                                <span>Filename: ${
                                    deck.filename
                                }</span>
                            </div>
                            <div class="deck-meta-item">
                                <i class="ri-information-line"></i>
                                <span>Use this deck with the Shinken bot to practice your Japanese vocabulary.</span>
                            </div>
                        </div>
                        <div class="deck-usage">
                            s!q -d ${deck.name}
                        </div>
                    </div>
                    <div class="deck-footer">
                        <div>
                            <span class="badge badge-primary">Japanese</span>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-primary edit-deck" data-deck="${
                                deck.name
                            }">
                                <i class="ri-edit-line"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-danger delete-deck" data-deck="${
                                deck.name
                            }">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        decksHtml += `</div>`;
        decksList.innerHTML = decksHtml;

        // Add event listeners
        document
            .querySelectorAll(".edit-deck")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    const deckName =
                        button.getAttribute("data-deck");
                    loadDeckForEdit(deckName);
                });
            });

        document
            .querySelectorAll(".delete-deck")
            .forEach((button) => {
                button.addEventListener("click", () => {
                    const deckName =
                        button.getAttribute("data-deck");
                    showDeleteConfirm(deckName);
                });
            });
    }

    async function loadDeckForEdit(deckName) {
        try {
            const response = await fetch(
                `/admin/decks/${deckName}`
            );

            if (!response.ok) {
                throw new Error(
                    `Error: ${response.status}`
                );
            }

            const data = await response.json();
            currentDeckName = deckName;
            currentDeckItems = data.items;
            currentDeckDescription = data.description || "";

            // Update UI
            editDeckName.textContent = deckName;
            deckNameEdit.value = deckName;
            deckDescriptionEdit.value =
                currentDeckDescription;
            deckUsageInfo.textContent = `s!q -d ${deckName}`;

            renderSpreadsheet(data.items);

            // Show edit view
            decksList.style.display = "none";
            deckEditView.style.display = "block";
        } catch (error) {
            console.error("Failed to load deck:", error);
            showAlert(
                "Error",
                "Failed to load deck for editing."
            );
        }
    }

    function renderSpreadsheet(items) {
        deckTableBody.innerHTML = "";

        // Ensure we have at least one row
        if (items.length === 0) {
            items = [
                {
                    japanese: "",
                    reading: "",
                    meaning: "",
                    sinoVietnamese: "",
                },
            ];
        }

        items.forEach((item, index) => {
            const row = createTableRow(item, index);
            deckTableBody.appendChild(row);
        });

        // Add event listeners for cell selection
        setupCellListeners();
    }

    function createTableRow(item, index) {
        const row = document.createElement("tr");
        row.dataset.rowIndex = index;

        row.innerHTML = `
            <td class="row-number">${index + 1}</td>
            <td><input type="text" class="cell-input japanese" data-col="0" value="${
                item.japanese || ""
            }"></td>
            <td><input type="text" class="cell-input reading" data-col="1" value="${
                item.reading || ""
            }"></td>
            <td><input type="text" class="cell-input meaning" data-col="2" value="${
                item.meaning || ""
            }"></td>
            <td><input type="text" class="cell-input sinoVietnamese" data-col="3" value="${
                item.sinoVietnamese || ""
            }"></td>
            <td class="actions-cell">
                <button class="btn btn-sm btn-ghost delete-row">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </td>
        `;

        // Add event listener for delete button
        row.querySelector(".delete-row").addEventListener(
            "click",
            () => {
                row.remove();
                renumberRows();
            }
        );

        return row;
    }

    function renumberRows() {
        const rows = deckTableBody.querySelectorAll("tr");
        rows.forEach((row, index) => {
            row.dataset.rowIndex = index;
            row.querySelector(".row-number").textContent =
                index + 1;
        });
    }

    function setupCellListeners() {
        const cells =
            deckTableBody.querySelectorAll(".cell-input");

        cells.forEach((cell) => {
            // Click to select a cell
            cell.addEventListener("click", (e) => {
                if (!e.shiftKey) {
                    clearSelection();
                    selectCell(cell);
                    startCell = cell;
                    endCell = cell;
                } else if (startCell) {
                    // Shift+click to select a range
                    clearSelection();
                    endCell = cell;
                    selectCellRange(startCell, endCell);
                }
            });

            // Drag to select multiple cells
            cell.addEventListener("mousedown", (e) => {
                if (e.button === 0) {
                    // Left mouse button
                    startCell = cell;
                }
            });

            cell.addEventListener("mouseenter", (e) => {
                if (e.buttons === 1 && startCell) {
                    // Left button is pressed
                    clearSelection();
                    endCell = cell;
                    selectCellRange(startCell, endCell);
                }
            });

            // Focus handling
            cell.addEventListener("focus", () => {
                clearSelection();
                selectCell(cell);
                startCell = cell;
                endCell = cell;
            });
        });

        // Handle mouseup anywhere in the document
        document.addEventListener("mouseup", () => {
            // Keep the selection after mouseup
        });
    }

    function selectCell(cell) {
        cell.classList.add("cell-selected");
        selectedCells = [cell];
    }

    function clearSelection() {
        selectedCells.forEach((cell) => {
            cell.classList.remove("cell-selected");
        });
        selectedCells = [];
    }

    function selectCellRange(start, end) {
        // Get row and column indices
        const startRow = parseInt(
            start.closest("tr").dataset.rowIndex
        );
        const startCol = parseInt(start.dataset.col);
        const endRow = parseInt(
            end.closest("tr").dataset.rowIndex
        );
        const endCol = parseInt(end.dataset.col);

        // Calculate the range
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        // Select all cells in the range
        const rows = deckTableBody.querySelectorAll("tr");
        selectedCells = [];

        for (let i = minRow; i <= maxRow; i++) {
            const row = rows[i];
            if (row) {
                const cells =
                    row.querySelectorAll(".cell-input");
                for (let j = minCol; j <= maxCol; j++) {
                    const cell = cells[j];
                    if (cell) {
                        cell.classList.add("cell-selected");
                        selectedCells.push(cell);
                    }
                }
            }
        }
    }

    function handleKeyDown(e) {
        // Only process if we're in the deck edit view
        if (deckEditView.style.display === "none") {
            return;
        }

        // Copy: Ctrl+C
        if (e.ctrlKey && e.key === "c") {
            copySelectedCells();
        }

        // Paste: Ctrl+V
        if (e.ctrlKey && e.key === "v") {
            // Only paste if a cell is focused
            const activeElement = document.activeElement;
            if (
                activeElement &&
                activeElement.classList.contains(
                    "cell-input"
                )
            ) {
                e.preventDefault();
                pasteToCell(activeElement);
            }
        }
    }

    function copySelectedCells() {
        if (selectedCells.length === 0) return;

        // Determine dimensions of selection
        const rowMap = new Map();

        selectedCells.forEach((cell) => {
            const row = cell.closest("tr");
            const rowIndex = parseInt(row.dataset.rowIndex);
            const colIndex = parseInt(cell.dataset.col);

            if (!rowMap.has(rowIndex)) {
                rowMap.set(rowIndex, new Map());
            }

            rowMap.get(rowIndex).set(colIndex, cell.value);
        });

        // Convert to tab-delimited text (compatible with spreadsheet apps)
        let clipboardText = "";

        // Sort row indices
        const rowIndices = Array.from(rowMap.keys()).sort(
            (a, b) => a - b
        );

        rowIndices.forEach((rowIndex) => {
            const columns = rowMap.get(rowIndex);
            const colIndices = Array.from(
                columns.keys()
            ).sort((a, b) => a - b);

            const rowText = colIndices
                .map((colIndex) => columns.get(colIndex))
                .join("\t");
            clipboardText += rowText + "\n";
        });

        // Store in our clipboard variable (we can't directly access system clipboard)
        clipboard = clipboardText;

        // Try to copy to system clipboard if API is available
        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {
            navigator.clipboard
                .writeText(clipboardText)
                .catch((err) => {
                    console.error(
                        "Could not copy to system clipboard:",
                        err
                    );
                });
        }
    }

    function pasteToCell(targetCell) {
        // If browser allows reading from clipboard
        if (
            navigator.clipboard &&
            navigator.clipboard.readText
        ) {
            navigator.clipboard
                .readText()
                .then((text) =>
                    processPaste(text, targetCell)
                )
                .catch((err) => {
                    console.error(
                        "Failed to read clipboard:",
                        err
                    );
                    // Fall back to our internal clipboard
                    if (clipboard) {
                        processPaste(clipboard, targetCell);
                    }
                });
        } else {
            // Fall back to our internal clipboard
            if (clipboard) {
                processPaste(clipboard, targetCell);
            }
        }
    }

    function processPaste(text, targetCell) {
        if (!text) return;

        // Parse the tabular data (tab/newline delimited)
        const rows = text.trim().split(/[\r\n]+/);
        if (rows.length === 0) return;

        const startRow = parseInt(
            targetCell.closest("tr").dataset.rowIndex
        );
        const startCol = parseInt(targetCell.dataset.col);

        // Process each row
        rows.forEach((rowText, rowOffset) => {
            const values = rowText.split(/[\t,]+/); // Support both tab and comma delimiters
            if (values.length === 0) return;

            // Get the target row
            const targetRowIndex = startRow + rowOffset;
            let targetRow = getRowByIndex(targetRowIndex);

            // Create new rows if needed
            if (!targetRow) {
                // Add rows until we reach the target
                while (
                    deckTableBody.querySelectorAll("tr")
                        .length <= targetRowIndex
                ) {
                    addNewRow();
                }
                targetRow = getRowByIndex(targetRowIndex);
            }

            // Update cells in the row
            values.forEach((value, colOffset) => {
                const targetColIndex = startCol + colOffset;
                if (targetColIndex <= 2) {
                    // Only process cells in our columns (japanese, reading, meaning)
                    const inputs =
                        targetRow.querySelectorAll(
                            ".cell-input"
                        );
                    if (inputs[targetColIndex]) {
                        inputs[targetColIndex].value =
                            value;
                    }
                }
            });
        });
    }

    function getRowByIndex(index) {
        return deckTableBody.querySelector(
            `tr[data-row-index="${index}"]`
        );
    }

    function addNewRow() {
        const index = deckTableBody.children.length;
        const row = createTableRow(
            {
                japanese: "",
                reading: "",
                meaning: "",
                sinoVietnamese: "",
            },
            index
        );
        deckTableBody.appendChild(row);
        setupCellListeners(); // Set up listeners for the new cells
        return row;
    }

    function showDecksList() {
        decksList.style.display = "block";
        deckEditView.style.display = "none";
        currentDeckName = "";
        currentDeckItems = [];
        currentDeckDescription = "";
        clearSelection();
    }

    function showDeleteConfirm(deckName) {
        document.getElementById(
            "deleteDeckName"
        ).textContent = deckName;
        currentDeckName = deckName;
        showModal(modals.confirmDelete);
    }

    function collectTableData() {
        const rows = deckTableBody.querySelectorAll("tr");
        const items = [];

        rows.forEach((row) => {
            const japanese = row
                .querySelector(".japanese")
                .value.trim();
            const reading = row
                .querySelector(".reading")
                .value.trim();
            const meaning = row
                .querySelector(".meaning")
                .value.trim();
            const sinoVietnamese = row
                .querySelector(".sinoVietnamese")
                .value.trim();

            // Collect all non-empty rows (at least one field has data)
            if (
                japanese ||
                reading ||
                meaning ||
                sinoVietnamese
            ) {
                items.push({
                    japanese,
                    reading,
                    meaning,
                    sinoVietnamese,
                });
            }
        });

        return items;
    }

    // Add debug function to inspect validation data
    function debugItems(items) {
        console.log("Items being validated:", items);
        // Log any items with empty fields
        items.forEach((item, index) => {
            if (
                !item.japanese ||
                !item.reading ||
                !item.meaning
            ) {
                console.log(
                    `Item ${index} has empty fields:`,
                    item
                );
            }
        });
    }

    // Update validateDeck function to log data
    async function validateDeck(items) {
        try {
            // Debug the items being sent
            debugItems(items);

            const response = await fetch(
                "/admin/validate-deck",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ items }),
                }
            );

            console.log("Response:", response);

            if (!response.ok) {
                throw new Error(
                    `Error: ${response.status}`
                );
            }

            const result = await response.json();
            console.log("Validation result:", result);
            return result;
        } catch (error) {
            console.error("Validation error:", error);
            return {
                valid: false,
                errors: [
                    {
                        field: "general",
                        message:
                            "Failed to validate: " +
                            error.message,
                    },
                ],
            };
        }
    }

    function showValidationErrors(validationResult) {
        // Clear previous errors
        clearValidationErrors();

        // If no errors, return
        if (validationResult.valid) {
            return;
        }

        // Create validation summary
        const validationSummary =
            document.createElement("div");
        validationSummary.className = "validation-summary";
        validationSummary.id = "validationSummary";

        // Add title
        const title = document.createElement("h4");
        title.textContent = `Please fix the following ${validationResult.errors.length} errors:`;
        validationSummary.appendChild(title);

        // Add error list
        const errorList = document.createElement("ul");

        // Group errors by row
        const generalErrors = [];
        const rowErrors = new Map();

        validationResult.errors.forEach((error) => {
            if (error.field === "general") {
                generalErrors.push(error.message);
            } else if (error.index !== undefined) {
                if (!rowErrors.has(error.index)) {
                    rowErrors.set(error.index, []);
                }
                rowErrors.get(error.index).push(error);

                // Also mark the field with error
                const row = deckTableBody.querySelector(
                    `tr[data-row-index="${error.index}"]`
                );
                if (row) {
                    const cell = row.querySelector(
                        `.${error.field}`
                    );
                    if (cell) {
                        cell.classList.add("error");

                        // Add error tooltip
                        const cellParent =
                            cell.parentElement;
                        cellParent.classList.add(
                            "cell-position-relative"
                        );

                        const tooltip =
                            document.createElement("div");
                        tooltip.className = "error-tooltip";
                        tooltip.textContent = error.message;
                        cellParent.appendChild(tooltip);

                        // Show tooltip on focus
                        cell.addEventListener(
                            "focus",
                            function () {
                                tooltip.style.display =
                                    "block";
                            }
                        );

                        // Hide tooltip on blur
                        cell.addEventListener(
                            "blur",
                            function () {
                                tooltip.style.display =
                                    "none";
                            }
                        );

                        // Initially hide tooltip
                        tooltip.style.display = "none";
                    }
                }
            }
        });

        // Add general errors
        generalErrors.forEach((message) => {
            const li = document.createElement("li");
            li.textContent = message;
            errorList.appendChild(li);
        });

        // Add row errors
        rowErrors.forEach((errors, rowIndex) => {
            errors.forEach((error) => {
                const li = document.createElement("li");
                li.textContent = `Row ${rowIndex + 1}: ${
                    error.message
                }`;
                errorList.appendChild(li);
            });
        });

        validationSummary.appendChild(errorList);

        // Add to the spreadsheet view before the table
        const container = document.querySelector(
            ".spreadsheet-container"
        );
        container.parentNode.insertBefore(
            validationSummary,
            container
        );

        // Scroll to first error
        if (validationResult.errors.length > 0) {
            const firstError = validationResult.errors.find(
                (e) => e.index !== undefined
            );
            if (firstError) {
                const row = deckTableBody.querySelector(
                    `tr[data-row-index="${firstError.index}"]`
                );
                if (row) {
                    row.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });
                    const cell = row.querySelector(
                        `.${firstError.field}`
                    );
                    if (cell) {
                        cell.focus();
                    }
                }
            } else {
                validationSummary.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            }
        }
    }

    function clearValidationErrors() {
        // Remove validation summary if exists
        const summary = document.getElementById(
            "validationSummary"
        );
        if (summary) {
            summary.remove();
        }

        // Remove error classes and tooltips
        document
            .querySelectorAll(".cell-input.error")
            .forEach((cell) => {
                cell.classList.remove("error");

                // Remove tooltip
                const cellParent = cell.parentElement;
                const tooltip = cellParent.querySelector(
                    ".error-tooltip"
                );
                if (tooltip) {
                    tooltip.remove();
                }
                cellParent.classList.remove(
                    "cell-position-relative"
                );
            });
    }

    // Update saveChanges function to validate before saving
    async function saveChanges() {
        try {
            const items = collectTableData();
            const newName = deckNameEdit.value.trim();
            const newDescription =
                deckDescriptionEdit.value.trim();

            if (!newName) {
                showAlert(
                    "Error",
                    "Deck name cannot be empty."
                );
                return;
            }

            if (items.length === 0) {
                showAlert(
                    "Warning",
                    "No items to save. Please add at least one vocabulary item."
                );
                return;
            }

            // Check if there are any items with data
            const hasValidItems = items.some(
                (item) =>
                    item.japanese &&
                    item.reading &&
                    item.meaning
            );

            if (!hasValidItems) {
                showAlert(
                    "Warning",
                    "No complete items found. Each item must have Japanese, reading, and meaning fields filled."
                );
                // Don't return here, we'll let validation show specific errors
            }

            // Validate items before saving
            const validationResult = await validateDeck(
                items
            );

            if (!validationResult.valid) {
                showValidationErrors(validationResult);
                return;
            }

            // Clear any previous validation errors
            clearValidationErrors();

            // First update the content
            const contentResponse = await fetch(
                `/admin/decks/${currentDeckName}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ items }),
                }
            );

            if (!contentResponse.ok) {
                const error = await contentResponse.json();
                if (
                    error.error &&
                    error.error.includes("Validation error")
                ) {
                    // Show the validation error directly to the user
                    showAlert(
                        "Validation Error",
                        error.error
                    );
                    return;
                }
                throw new Error(
                    error.error ||
                        "Failed to save deck content"
                );
            }

            // Then update metadata if it changed
            if (
                newName !== currentDeckName ||
                newDescription !== currentDeckDescription
            ) {
                const metadataResponse = await fetch(
                    `/admin/decks/${currentDeckName}/metadata`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            name: newName,
                            description: newDescription,
                        }),
                    }
                );

                if (!metadataResponse.ok) {
                    const error =
                        await metadataResponse.json();
                    throw new Error(
                        error.error ||
                            "Failed to update deck metadata"
                    );
                }

                const metadataResult =
                    await metadataResponse.json();

                // Update current state with new metadata
                currentDeckName = metadataResult.name;
                currentDeckDescription =
                    metadataResult.description;

                // Update UI elements to reflect metadata changes
                editDeckName.textContent = currentDeckName;
                deckUsageInfo.textContent = `s!q -d ${currentDeckName}`;

                showAlert(
                    "Success",
                    "Deck updated successfully with new metadata."
                );
            } else {
                showAlert(
                    "Success",
                    "Deck content updated successfully."
                );
            }

            // Update current items state
            currentDeckItems = items;
        } catch (error) {
            console.error("Failed to save changes:", error);
            showAlert(
                "Error",
                error.message || "Failed to save changes."
            );
        }
    }

    async function createNewDeck() {
        try {
            const name = document
                .getElementById("deckName")
                .value.trim();
            const description = document
                .getElementById("deckDescription")
                .value.trim();

            if (!name) {
                showAlert(
                    "Error",
                    "Deck name is required."
                );
                return;
            }

            // Create an empty deck (we'll validate later when adding items)
            const response = await fetch("/admin/decks", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, description }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(
                    error.error || "Failed to create deck"
                );
            }

            hideModal(modals.newDeck);
            document.getElementById("deckName").value = "";
            document.getElementById(
                "deckDescription"
            ).value = "";

            showAlert(
                "Success",
                "Deck created successfully."
            );
            loadDecks();
        } catch (error) {
            console.error("Failed to create deck:", error);
            showAlert(
                "Error",
                error.message || "Failed to create deck."
            );
        }
    }

    async function importDeck() {
        try {
            const name = document
                .getElementById("importDeckName")
                .value.trim();
            const description = document
                .getElementById("importDeckDescription")
                .value.trim();
            const csvText = document
                .getElementById("csvText")
                .value.trim();

            if (!name) {
                showAlert(
                    "Error",
                    "Deck name is required."
                );
                return;
            }

            if (!csvText) {
                showAlert(
                    "Error",
                    "Please provide CSV data."
                );
                return;
            }

            // Parse CSV to items for validation using proper CSV parsing
            const items = [];
            const lines = csvText.trim().split(/\r?\n/);

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
                // Parse CSV line properly handling quotes
                const parts = parseCSVLine(lines[i]);

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

            // Helper function to parse CSV line with quoted fields
            function parseCSVLine(line) {
                const result = [];
                let current = "";
                let inQuotes = false;

                for (let i = 0; i < line.length; i++) {
                    const char = line[i];

                    if (char === '"') {
                        // Toggle quote state
                        inQuotes = !inQuotes;
                    } else if (char === "," && !inQuotes) {
                        // End of field, add to result
                        result.push(current);
                        current = "";
                    } else {
                        // Add character to current field
                        current += char;
                    }
                }

                // Add the last field
                result.push(current);

                // Remove quotes from quoted fields
                return result.map((field) => {
                    field = field.trim();
                    if (
                        field.startsWith('"') &&
                        field.endsWith('"')
                    ) {
                        return field.substring(
                            1,
                            field.length - 1
                        );
                    }
                    return field;
                });
            }

            // Validate items before importing
            if (items.length > 0) {
                const validationResult = await validateDeck(
                    items
                );

                if (!validationResult.valid) {
                    // Show validation error in alert
                    let errorMessages =
                        "The CSV data contains the following errors:\n\n";
                    validationResult.errors.forEach(
                        (error) => {
                            if (error.index !== undefined) {
                                errorMessages += `• Row ${
                                    error.index + 1
                                }: ${error.message}\n`;
                            } else {
                                errorMessages += `• ${error.message}\n`;
                            }
                        }
                    );

                    showAlert(
                        "Validation Error",
                        errorMessages
                    );
                    return;
                }
            }

            const response = await fetch(
                "/admin/parse-csv",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name,
                        description,
                        csvText,
                    }),
                }
            );

            if (!response.ok) {
                const error = await response.json();
                if (
                    error.error &&
                    error.error.includes("Validation error")
                ) {
                    // Show the validation error directly to the user
                    showAlert(
                        "Validation Error",
                        error.error
                    );
                    return;
                }
                throw new Error(
                    error.error || "Failed to import deck"
                );
            }

            const result = await response.json();

            hideModal(modals.importCsv);
            document.getElementById(
                "importDeckName"
            ).value = "";
            document.getElementById(
                "importDeckDescription"
            ).value = "";
            document.getElementById("csvText").value = "";

            showAlert(
                "Success",
                `Deck imported successfully with ${
                    result.itemCount || 0
                } items.`
            );
            loadDecks();
        } catch (error) {
            console.error("Failed to import deck:", error);
            showAlert(
                "Error",
                error.message || "Failed to import deck."
            );
        }
    }

    async function deleteDeck() {
        try {
            const response = await fetch(
                `/admin/decks/${currentDeckName}`,
                {
                    method: "DELETE",
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(
                    error.error || "Failed to delete deck"
                );
            }

            hideModal(modals.confirmDelete);
            showAlert(
                "Success",
                "Deck deleted successfully."
            );
            loadDecks();
        } catch (error) {
            console.error("Failed to delete deck:", error);
            showAlert(
                "Error",
                error.message || "Failed to delete deck."
            );
        }
    }

    function showAlert(title, message) {
        document.getElementById("alertTitle").textContent =
            title;
        document.getElementById(
            "alertMessage"
        ).textContent = message;
        showModal(modals.alert);
    }

    // Function to handle CSV file upload
    function handleCsvFileUpload(event) {
        const fileInput = event.target;
        const file = fileInput.files[0];

        if (!file) return;

        // Display file name
        const fileNameElement = document.getElementById(
            "uploadFileName"
        );
        fileNameElement.textContent = file.name;

        // Read file contents
        const reader = new FileReader();

        reader.onload = function (e) {
            const contents = e.target.result;
            // Populate the textarea with file contents
            document.getElementById("csvText").value =
                contents;
        };

        reader.onerror = function () {
            showAlert("Error", "Failed to read the file");
        };

        reader.readAsText(file);
    }
});
