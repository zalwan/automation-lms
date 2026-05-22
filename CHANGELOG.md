# Changelog

All notable changes to this project will be documented in this file.

## [v1.2.4] - 2026-01-16

### ✨ Improvements

- **Auto-versioning** - Manifest version is now automatically updated from git tag during build
- **Smart release notes** - Changelog is automatically extracted and included in GitHub releases
- **Better caching** - Improved pnpm cache setup for faster CI builds
- **Versioned artifacts** - Build artifacts now include version number in filename

### 📚 Documentation

- Added comprehensive README with installation and usage instructions
- Added release workflow documentation
- Created CHANGELOG.md for tracking version history
- Added build status badge

### 🛠️ Technical Changes

- Updated GitHub Actions workflow with proper step ordering
- Added `--frozen-lockfile` for reproducible builds
- Upgraded `pnpm/action-setup` to v4
- Added `workflow_dispatch` for manual builds

---

## [v1.2.3] - 2026-01-16

### ✨ Improvements

- Updated README with release workflow documentation
- Improved GitHub Actions workflow with auto-versioning

### 🛠️ Technical Changes

- Auto-update `manifest.json` version from git tag
- Extract changelog for release notes automatically
- Added build status badge to README

---

## [v1.0.1] - 2026-01-16

### ✨ Improvements

- **More reliable radio button selection** - The extension now uses native click interactions and properly handles Vue/Quasar component events, ensuring selections are properly registered by the LMS.

- **Better slow connection handling** - Added retry mechanism that automatically re-attempts filling unfilled questions before proceeding to the next step. Won't click "Next" until all questions are confirmed filled.

- **Improved step detection** - Fixed an issue where questions from previous steps could be incorrectly detected, causing the script to misidentify the current page.

- **Value persistence fix** - Selections now persist correctly when navigating or saving, by sending the proper numeric values expected by the form backend.

### 🛠️ Technical Changes

- Made selection function async with proper delays for Vue reactivity
- Added multiple fallback strategies for clicking (native → synthetic → direct input)
- Implemented up to 5 retry rounds per step for unreliable connections
- Wait for "Next" button to become enabled before proceeding

---

## [v1.0.0] - 2026-01-16

### 🎉 Initial Release

- **Exam Questionnaire Filler** - Automatically fills midterm/final questionnaires with one click
- Supports multiple fill modes: Selalu, Sering, Kadang-kadang, Tidak Pernah, and Random Mix
- Auto-navigation through multi-step questionnaires
- Detects save button to stop at the final step
