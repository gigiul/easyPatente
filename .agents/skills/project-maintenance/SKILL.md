---
name: project-maintenance
description: Rules and guidelines for keeping the project documentation and architecture documentation up to date.
---

# Project Maintenance - easyPatente

This document defines the instructions for the agent to ensure the project remains healthy, documented, and internally consistent.

## 1. Documentation Integrity (APP_STRUCTURE.md)

The file `APP_STRUCTURE.md` in the project root is the **Single Source of Truth** for the application's architecture.

- **MANDATORY UPDATE**: Any time a change is made to the following, `APP_STRUCTURE.md` MUST be updated immediately:
    - **Database Schema**: New tables, renamed columns, modified triggers/RPCs.
    - **App Structure**: New screens, modified routing logic, or new Tab items.
    - **Core Logic**: Changes in State Management (Zustand) or significant custom Hooks.
    - **Roadmap**: Mark implemented features as completed and add new ones if discussed.

## 2. Code Consistency Checks

- **Types**: When modifying a database table, always check the corresponding file in `/types/` to ensure TypeScript interfaces match the schema.
- **Translations**: When adding features to a screen, update **all** relevant locales in `/i18n/locales/` (or at least acknowledge missing ones if explicitly requested by the user).
- **CSS Best Practices**: Always consult the `css-best-practises` skill before creating new UI components.

## 3. Post-Refactor Protocol

After every significant refactor:
1.  **Read `APP_STRUCTURE.md`**: Verify if the description of the modified part is still accurate.
2.  **Edit `APP_STRUCTURE.md`**: Update the specific sections (e.g., Screen description, SQL Schema block).
3.  **Confirm**: Mention that the documentation has been kept in sync in the final response to the user.
