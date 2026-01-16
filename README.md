# LMalaS - LMS Automation Extension

> Save your time & life 🚀

A Chrome extension to automate repetitive tasks on the Mentari LMS platform.

[![Build & Release](https://github.com/zalwan/automation-lms/actions/workflows/build-extension.yml/badge.svg)](https://github.com/zalwan/automation-lms/actions/workflows/build-extension.yml)

## ✨ Features

### Exam Questionnaire Filler
Automatically fills midterm/final questionnaires with one click. Supports multiple modes:
- **Selalu** - Always
- **Sering** - Often  
- **Kadang-kadang** - Sometimes
- **Tidak Pernah** - Never
- **Random Mix** - Randomized answers

**Smart Features:**
- Auto-navigation through multi-step questionnaires
- Retry mechanism for slow connections
- Detects save button to stop at final step
- Proper value persistence on save/navigation

## 📦 Installation

### From Release (Recommended)
1. Download the latest `.zip` file from [Releases](https://github.com/zalwan/automation-lms/releases)
2. Extract the zip file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (top right)
5. Click "Load unpacked" and select the extracted folder

### From Source
```bash
# Clone the repository
git clone https://github.com/zalwan/automation-lms.git
cd automation-lms

# Install dependencies
pnpm install

# Build the extension
pnpm run build

# Load the 'build' folder as unpacked extension in Chrome
```

## 🛠️ Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## � Creating a Release

To publish a new version:

### 1. Update the Changelog
Add your changes to `CHANGELOG.md`:
```markdown
## [v1.x.x] - YYYY-MM-DD

### ✨ Improvements
- Your new feature or fix

### 🛠️ Technical Changes  
- Technical details
```

### 2. Commit Your Changes
```bash
git add .
git commit -m "Release v1.x.x"
git push origin main
```

### 3. Create and Push a Tag
```bash
git tag v1.x.x
git push origin v1.x.x
```

The GitHub Action will automatically:
- ✅ Update `manifest.json` version
- ✅ Build the extension
- ✅ Extract release notes from `CHANGELOG.md`
- ✅ Create a GitHub Release with the zip file

### Version Format
- `v1.0.0` - Stable release
- `v1.0.0-beta` - Beta release (marked as prerelease)
- `v1.0.0-rc.1` - Release candidate (marked as prerelease)

## �📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## 🔧 Tech Stack

- [SvelteKit](https://kit.svelte.dev) - Framework
- [Skeleton](https://www.skeleton.dev) - UI Components
- [Tailwind CSS](https://tailwindcss.com) - Styling
- [TypeScript](https://www.typescriptlang.org) - Type Safety
- [Vite](https://vitejs.dev) - Build Tool

## 📄 License

MIT License - feel free to use and modify.

---

Made with ❤️ from lazyMan
