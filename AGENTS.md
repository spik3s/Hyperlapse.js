# Jules Agent Guidelines

This file contains instructions for Jules (the agent) on how to manage branches and Pull Requests.

## Branching Strategy

When creating a new branch, you must adhere to the following naming convention:
`{task type}/{task name or short description}`

### Allowed Task Types
*   **feature**: For new features or significant additions.
*   **bug**: For bug fixes. (Note: use `bug` instead of `fix`).
*   **chore**: For maintenance tasks, documentation, refactoring, tests, or styling changes.

### Examples
*   `feature/add-login-button`
*   `bug/fix-header-alignment`
*   `chore/update-readme`
*   `chore/refactor-auth-logic`

## Pull Request Guidelines

### Title Format
The PR title must start with the task type in **UPPERCASE**, followed by a colon, and then a **Title Case** description.

**Format:** `TYPE: Short Description`

**Examples:**
*   `FEATURE: Add User Login Flow`
*   `BUG: Fix Carousel Navigation Error`
*   `CHORE: Update Dependencies`

### Description Template
Your PR description must include the following sections using Markdown headers:

#### ## Problem
Describe the issue, challenge, or requirement that this PR addresses. What was missing or broken?

#### ## Solution
Explain the changes you made to address the problem. How did you implement the solution?

#### ## Proof of Work
If the changes involve the UI, you **must** include a screenshot demonstrating the result. If no UI changes were made, you may state "No UI changes."
