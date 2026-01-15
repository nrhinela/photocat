# Overview
@README.md for project overview
@docs/DEPLOYMENT.md for deployment instructions.
@docs/refactoring_plan.md for the frontend refactoring plan, in case some legacy code is observed
- @src/photocat/static contains some legacy html files that were the source of the latest front-end conversion.
- Originally designed to accomodate multiple categorization models, currently only one is supported.

## Additional Instructions for Claude:

- In choosing architecture, keep filesizes modular and small, because lesser LLMS are using this codebase.
- The project is designed to be used with continue.dev. See .continue/rules for coding standards

