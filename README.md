# Timmy — Time Tracker

**Free, open-source desktop time tracking app for freelancers and agencies**

Built by [Shapeusto](https://shapeusto.com) · [shapeusto.com/timmy-time-tracker/](https://shapeusto.com/timmy-time-tracker/)

---

## Features

- **Always-on-top timer** — stays visible while you work
- **Collapsible interface** — minimal screen space when collapsed, clickthrough when idle
- **Multiple clients & tasks** — organize work by client, task, and subtask
- **Nested subtasks** — break down tasks into smaller units
- **Notes panel** — per-task notes with image paste support
- **Date-based filtering** — view time entries by date range
- **Export** — generate PDF and CSV reports
- **Google Calendar sync** — bidirectional sync with Google Calendar and Tasks
- **Screen recording** — record work sessions with audio

## Installation

Download the latest installer from [Releases](../../releases) and run it.

**System requirements:**
- Windows 10+ (64-bit), macOS 10.15+, or Linux
- 256 MB RAM minimum
- 200 MB free disk space

## Development

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build for all platforms
npm run build:all

# Build for Windows only
npm run build:win

# Run tests
npm test
```

## Data Storage

Your time tracking data is stored locally:

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%\timmy\projects.json` |
| macOS | `~/Library/Application Support/timmy/projects.json` |
| Linux | `~/.config/timmy/projects.json` |

## Code Signing Policy

Timmy is signed through the [SignPath Foundation](https://signpath.org) open source program.

**Roles:**
- **Approvers** (authorize release signing): Shapeusto maintainers
- **Committers** (can push directly): Shapeusto maintainers
- **Reviewers** (must review external PRs): Shapeusto maintainers

All releases are built from source via GitHub Actions and require manual approval before signing. No binaries are added to the repository.

**Privacy:** This app stores all data locally. No information is transferred to external servers unless the user explicitly connects a Google account via OAuth.

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Open a pull request

## License

[MIT](LICENSE) © 2025 [Shapeusto](https://shapeusto.com)
