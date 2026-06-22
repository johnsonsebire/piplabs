const fs = require('fs');
const path = require('path');

const yamlPath = path.join(__dirname, 'lib/api-spec/openapi.yaml');
let content = fs.readFileSync(yamlPath, 'utf8');

// Add futures to tradeType enums
content = content.replace(/enum: \[vanilla_options, forex, multiplier\]/g, 'enum: [vanilla_options, forex, multiplier, futures]');

const pathsToAdd = `
  /journals:
    get:
      operationId: listJournals
      tags: [journals]
      summary: List all journal entries
      parameters:
        - name: accountName
          in: query
          schema:
            type: string
        - name: symbol
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: List of journal entries
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/JournalEntry"
    post:
      operationId: createJournal
      tags: [journals]
      summary: Create a new journal entry
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/JournalEntryInput"
      responses:
        "201":
          description: Created journal entry
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalEntry"

  /journals/stats:
    get:
      operationId: getJournalStats
      tags: [journals]
      summary: Get journal statistics and metrics
      parameters:
        - name: accountName
          in: query
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Journal stats
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalStats"

  /journals/{id}:
    get:
      operationId: getJournal
      tags: [journals]
      summary: Get a single journal entry
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "200":
          description: The journal entry
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalEntry"
    patch:
      operationId: updateJournal
      tags: [journals]
      summary: Update a journal entry
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/JournalEntryUpdate"
      responses:
        "200":
          description: Updated journal entry
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalEntry"
    delete:
      operationId: deleteJournal
      tags: [journals]
      summary: Delete a journal entry
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      responses:
        "204":
          description: Deleted successfully

components:`;

content = content.replace('components:', pathsToAdd);

const schemasToAdd = `
    JournalEntry:
      type: object
      properties:
        id:
          type: integer
        userId:
          type: string
        accountName:
          type: string
        symbol:
          type: string
        side:
          type: string
          enum: [buy, sell]
        tradeType:
          type: string
          enum: [vanilla_options, forex, multiplier, futures]
        volume:
          type: number
        openTime:
          type: string
          format: date-time
        closeTime:
          type: ["string", "null"]
          format: date-time
        openPrice:
          type: number
        closePrice:
          type: ["number", "null"]
        profitLossRaw:
          type: ["number", "null"]
        grossProfit:
          type: ["number", "null"]
        durationMinutes:
          type: ["integer", "null"]
        notes:
          type: ["string", "null"]
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
      required:
        - id
        - userId
        - accountName
        - symbol
        - side
        - tradeType
        - volume
        - openTime
        - openPrice
        - createdAt
        - updatedAt

    JournalEntryInput:
      type: object
      properties:
        accountName:
          type: string
        symbol:
          type: string
        side:
          type: string
          enum: [buy, sell]
        tradeType:
          type: string
          enum: [vanilla_options, forex, multiplier, futures]
        volume:
          type: number
        openTime:
          type: string
          format: date-time
        closeTime:
          type: ["string", "null"]
          format: date-time
        openPrice:
          type: number
        closePrice:
          type: ["number", "null"]
        profitLossRaw:
          type: ["number", "null"]
        grossProfit:
          type: ["number", "null"]
        durationMinutes:
          type: ["integer", "null"]
        notes:
          type: ["string", "null"]
      required:
        - accountName
        - symbol
        - side
        - tradeType
        - volume
        - openTime
        - openPrice

    JournalEntryUpdate:
      type: object
      properties:
        accountName:
          type: string
        symbol:
          type: string
        side:
          type: string
          enum: [buy, sell]
        tradeType:
          type: string
          enum: [vanilla_options, forex, multiplier, futures]
        volume:
          type: number
        openTime:
          type: string
          format: date-time
        closeTime:
          type: ["string", "null"]
          format: date-time
        openPrice:
          type: number
        closePrice:
          type: ["number", "null"]
        profitLossRaw:
          type: ["number", "null"]
        grossProfit:
          type: ["number", "null"]
        durationMinutes:
          type: ["integer", "null"]
        notes:
          type: ["string", "null"]

    JournalStats:
      type: object
      properties:
        totalTrades:
          type: integer
        winRate:
          type: number
        profitFactor:
          type: number
        totalPnL:
          type: number
        averageWin:
          type: number
        averageLoss:
          type: number
        byDuration:
          type: array
          items:
            type: object
            properties:
              duration:
                type: string
              pnl:
                type: number
              winRate:
                type: number
            required:
              - duration
              - pnl
              - winRate
      required:
        - totalTrades
        - winRate
        - profitFactor
        - totalPnL
        - averageWin
        - averageLoss
        - byDuration
`;

content = content + schemasToAdd;

fs.writeFileSync(yamlPath, content);
console.log('Successfully updated openapi.yaml');
