# Overview
@README.md for project overview
@docs/DEPLOYMENT.md for deployment instructions.
@docs/refactoring_plan.md for the frontend refactoring plan, in case some legacy code is observed
- @src/photocat/static contains some legacy html files that were the source of the latest front-end conversion.
- Originally designed to accomodate multiple categorization models, currently only one is supported.

## Additional Instructions for Claude:

- In choosing architecture, keep filesizes modular and small, because lesser LLMS are using this codebase.
- The project is designed to be used with continue.dev. See .continue/rules for coding standards

## Token Efficiency

- Prefer targeted line-range reads over full file reads when possible
- Use Grep/Glob to locate code before reading entire files
- When exploring, start with the most specific search possible
- Avoid using the Explore agent for simple lookups - use direct file reads instead

## Key Entry Points

- Frontend: frontend/main.js → frontend/components/photocat-app.js
- Backend API: src/photocat/api.py
- Database models: src/photocat/models.py

