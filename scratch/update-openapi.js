const fs = require('fs');
const path = require('path');

const filepath = path.join(process.cwd(), 'lib/api-spec/openapi.yaml');
let content = fs.readFileSync(filepath, 'utf8');

// 1. Add schemas
const schemasToAdd = `
    JournalWorkspace:
      type: object
      properties:
        id:
          type: string
        userId:
          type: string
        name:
          type: string
        startingBalance:
          type: number
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
      required:
        - id
        - userId
        - name
        - startingBalance
        - createdAt
        - updatedAt

    JournalWorkspaceInput:
      type: object
      properties:
        name:
          type: string
        startingBalance:
          type: number
      required:
        - name

    JournalWorkspaceUpdate:
      type: object
      properties:
        name:
          type: string
        startingBalance:
          type: number
`;

if (!content.includes('JournalWorkspace:')) {
  // Find where to inject schemas (e.g., before JournalEntry)
  content = content.replace('    JournalEntry:', schemasToAdd + '\n    JournalEntry:');
}

// 2. Add endpoints
const endpointsToAdd = `
  /journals/workspaces:
    get:
      operationId: listJournalWorkspaces
      tags: [journals]
      summary: List all journal workspaces
      responses:
        "200":
          description: A list of workspaces
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/JournalWorkspace"
        "401":
          description: Unauthorized
    post:
      operationId: createJournalWorkspace
      tags: [journals]
      summary: Create a new journal workspace
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/JournalWorkspaceInput"
      responses:
        "201":
          description: Workspace created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalWorkspace"
        "400":
          description: Invalid input
        "401":
          description: Unauthorized

  /journals/workspaces/{id}:
    patch:
      operationId: updateJournalWorkspace
      tags: [journals]
      summary: Update a journal workspace
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/JournalWorkspaceUpdate"
      responses:
        "200":
          description: Workspace updated
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/JournalWorkspace"
        "404":
          description: Not found
        "401":
          description: Unauthorized
    delete:
      operationId: deleteJournalWorkspace
      tags: [journals]
      summary: Delete a journal workspace
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "204":
          description: Workspace deleted
        "404":
          description: Not found
        "401":
          description: Unauthorized
`;

if (!content.includes('/journals/workspaces:')) {
  // Inject before /journals:
  content = content.replace('  /journals:', endpointsToAdd + '\n  /journals:');
}

fs.writeFileSync(filepath, content);
console.log('Done!');
